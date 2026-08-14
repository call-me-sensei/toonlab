import {
  createGenerationJob,
  finishGenerationJob,
  getGenerationJob,
  listGenerationJobs,
  providerConfiguration,
  readObject,
  saveLibraryEntry,
  saveObject,
  updateGenerationJob,
} from './repository.mjs';
import {
  downloadProviderAsset,
  pollMeshyTask,
  pollTripoTask,
  runProvider,
} from './providers.mjs';

const IMAGE_KINDS = new Set(['image', 'texture_image', 'concept_image']);
const MODEL_KINDS = new Set(['text_to_model', 'image_to_model', 'multiview_to_model', 'model_segment']);
const RESOLUTIONS = new Set(['1k', '2k', '4k']);
const ASPECT_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4']);

function publicFile(file) {
  if (!file) return null;
  return {
    absolutePath: file.absolutePath,
    byteSize: Number(file.byteSize ?? file.sizeBytes ?? file.byte_size ?? 0),
    contentType: file.mimeType ?? file.content_type ?? 'application/octet-stream',
    id: file.id,
    kind: file.kind,
    name: file.name ?? file.relativePath?.split('/').pop() ?? 'asset',
    relativePath: file.relativePath,
  };
}

export function publicGenerationJob(job) {
  if (!job) return null;
  const result = job.result && typeof job.result === 'object'
    ? {
        ...job.result,
        ...(job.result.file ? { file: publicFile(job.result.file) } : {}),
        ...(job.result.previewFile ? { previewFile: publicFile(job.result.previewFile) } : {}),
        ...(job.result.conceptFile ? { conceptFile: publicFile(job.result.conceptFile) } : {}),
      }
    : job.result;
  return {
    ...job,
    prompt: job.request?.prompt ?? job.request?.user ?? '',
    result,
  };
}

function configuredImageModel(id, configuration) {
  return configuration.imageModels.find((model) => model.id === id) ?? null;
}

/** Pure request planner shared by MCP validation and regression tests. */
export function resolveGenerationPlan(args, configuration = providerConfiguration()) {
  const kind = String(args.kind ?? '');
  if (!IMAGE_KINDS.has(kind) && !MODEL_KINDS.has(kind)) {
    throw new Error(`Unsupported generation kind "${kind}".`);
  }
  const resolution = String(args.resolution ?? '1k').toLowerCase();
  if (!RESOLUTIONS.has(resolution)) throw new Error(`Unsupported resolution "${resolution}".`);
  const aspectRatio = String(args.aspect_ratio ?? '1:1');
  if (!ASPECT_RATIOS.has(aspectRatio)) throw new Error(`Unsupported aspect ratio "${aspectRatio}".`);
  const modelProvider = String(args.model_provider ?? 'meshy');
  if (!['meshy', 'tripo'].includes(modelProvider)) throw new Error('model_provider must be meshy or tripo.');
  if (modelProvider === 'meshy' && kind === 'model_segment') {
    throw new Error('Meshy 7 does not support model segmentation; choose tripo.');
  }
  const textViaImage = kind === 'text_to_model' && modelProvider === 'meshy';
  const imageModelId = String(args.image_model ?? configuration.imageModels[0]?.id ?? '');
  const imageModel = configuredImageModel(imageModelId, configuration);
  if ((IMAGE_KINDS.has(kind) || textViaImage) && !imageModel) {
    throw new Error(`Unknown image model "${imageModelId}".`);
  }
  if ((IMAGE_KINDS.has(kind) || textViaImage) && !imageModel.resolutions.includes(resolution)) {
    throw new Error(`${imageModel.label} does not support ${resolution}.`);
  }
  if (kind === 'image_to_model' && !args.source_image_path && !args.source_job_id) {
    throw new Error('image_to_model requires source_image_path or source_job_id.');
  }
  if (kind === 'multiview_to_model') {
    const views = Array.isArray(args.view_paths) ? args.view_paths.slice(0, 4) : [];
    if (!views[0] || views.filter(Boolean).length < 2) {
      throw new Error('multiview_to_model requires a front view and at least one additional view.');
    }
  }
  if (kind === 'model_segment' && !args.source_job_id) {
    throw new Error('model_segment requires source_job_id.');
  }
  const provider = IMAGE_KINDS.has(kind) ? imageModel.provider : modelProvider;
  if (!configuration.providers[provider]) throw new Error(`${provider} is not configured.`);
  if (textViaImage && !configuration.providers[imageModel.provider]) {
    throw new Error(`${imageModel.provider} is not configured for the selected image model.`);
  }
  return {
    aspectRatio,
    imageModel,
    kind,
    provider,
    resolution,
    textViaImage,
  };
}

async function referenceImage(workspacePath, relativePath) {
  const file = await readObject(workspacePath, relativePath);
  if (!String(file.mimeType).startsWith('image/')) throw new Error('Generation references must be images.');
  return { bytes: new Uint8Array(file.data), mimeType: file.mimeType };
}

async function storeInlineImage(workspacePath, jobId, result, kind = 'generated-image') {
  const extension = result.contentType === 'image/jpeg'
    ? 'jpg'
    : result.contentType === 'image/webp' ? 'webp' : 'png';
  return publicFile(await saveObject(workspacePath, result.bytes, {
    contentType: result.contentType,
    kind,
    name: `generation-${jobId}.${extension}`,
  }));
}

export async function startManagedGeneration(workspacePath, args) {
  const configuration = providerConfiguration();
  const plan = resolveGenerationPlan(args, configuration);
  const prompt = String(args.prompt ?? '').trim();
  if (prompt.length > 600) throw new Error('Prompt exceeds 600 characters.');
  if (!['image_to_model', 'multiview_to_model', 'model_segment'].includes(plan.kind) && !prompt) {
    throw new Error('A prompt is required.');
  }
  const request = {
    aspectRatio: plan.aspectRatio,
    imageModel: plan.imageModel?.id ?? null,
    imagePath: args.source_image_path ?? null,
    kind: plan.kind,
    modelProvider: args.model_provider ?? 'meshy',
    prompt,
    resolution: plan.resolution,
    sourceJobId: args.source_job_id ?? null,
    style: args.style ?? 'stylized',
    textViaImage: plan.textViaImage,
    views: Array.isArray(args.view_paths) ? args.view_paths.slice(0, 4) : [],
  };
  const job = await createGenerationJob(plan.provider, plan.kind, request);
  try {
    let sourceImagePath = request.imagePath;
    let originalTaskId = null;
    if (request.sourceJobId) {
      const source = await getGenerationJob(request.sourceJobId);
      if (!source || source.status !== 'succeeded') throw new Error('source_job_id must name a succeeded generation job.');
      sourceImagePath ??= source.result?.file?.relativePath ?? null;
      originalTaskId = source.result?.taskId ?? null;
    }

    const referencePaths = Array.isArray(args.reference_paths) ? args.reference_paths.slice(0, 6) : [];
    if (sourceImagePath) referencePaths.unshift(sourceImagePath);
    const referenceImages = await Promise.all(referencePaths.map((path) => referenceImage(workspacePath, String(path))));
    const viewImages = await Promise.all(request.views.map((path) => path ? referenceImage(workspacePath, String(path)) : null));
    let conceptFile = null;
    let providerResult;

    if (plan.textViaImage) {
      const concept = await runProvider(plan.imageModel.provider, {
        aspectRatio: plan.aspectRatio,
        kind: 'concept_image',
        model: plan.imageModel.model,
        prompt,
        referenceImages,
        resolution: plan.resolution,
      });
      if (!(concept.bytes instanceof Uint8Array)) throw new Error('The selected image model returned no concept image.');
      if (!['image/png', 'image/jpeg'].includes(concept.contentType)) {
        throw new Error('Meshy 7 requires the concept model to return PNG or JPEG.');
      }
      conceptFile = await storeInlineImage(workspacePath, job.id, concept, 'generated-concept');
      providerResult = await runProvider('meshy', {
        kind: 'image_to_model',
        referenceImages: [{ bytes: concept.bytes, mimeType: concept.contentType }],
      });
    } else {
      providerResult = await runProvider(plan.provider, {
        aspectRatio: plan.aspectRatio,
        kind: plan.kind,
        model: plan.imageModel?.model,
        originalTaskId,
        prompt,
        referenceImages,
        resolution: plan.resolution,
        style: request.style,
        viewImages,
      });
    }

    if (providerResult.pending) {
      return publicGenerationJob(await updateGenerationJob(job.id, {
        ...providerResult,
        ...(conceptFile ? { conceptFile, pipeline: 'concept_image -> meshy-7' } : {}),
      }));
    }
    if (providerResult.bytes instanceof Uint8Array) {
      const file = await storeInlineImage(workspacePath, job.id, providerResult);
      return publicGenerationJob(await finishGenerationJob(job.id, {
        result: { file, provider: providerResult.provider },
      }));
    }
    return publicGenerationJob(await finishGenerationJob(job.id, { result: providerResult }));
  } catch (error) {
    await finishGenerationJob(job.id, { error: error?.message ?? String(error) });
    throw error;
  }
}

export async function advanceManagedGeneration(workspacePath, inputJob) {
  const job = typeof inputJob === 'string' ? await getGenerationJob(inputJob) : inputJob;
  if (!job || !['tripo', 'meshy'].includes(job.provider) || job.status !== 'running' || !job.result?.taskId) {
    return publicGenerationJob(job);
  }
  let task;
  try {
    task = job.provider === 'meshy'
      ? await pollMeshyTask(job.result.taskId, job.kind)
      : await pollTripoTask(job.result.taskId);
  } catch (error) {
    const pollFailures = Number(job.result.pollFailures ?? 0) + 1;
    if (pollFailures >= 5 || (Number(error?.providerStatus) >= 400 && Number(error?.providerStatus) < 500 && Number(error?.providerStatus) !== 429)) {
      return publicGenerationJob(await finishGenerationJob(job.id, {
        error: error?.message ?? String(error),
        result: { ...job.result, pollFailures },
      }));
    }
    return publicGenerationJob(await updateGenerationJob(job.id, {
      ...job.result,
      lastPollError: error?.message ?? String(error),
      pollFailures,
    }));
  }

  if (task.status === 'success') {
    const outputUrl = task.output?.pbr_model ?? task.output?.model ?? task.output?.base_model;
    if (!outputUrl) return publicGenerationJob(await finishGenerationJob(job.id, {
      error: `${job.provider} completed without a downloadable model`,
      result: { ...job.result, task },
    }));
    try {
      const downloaded = await downloadProviderAsset(outputUrl);
      const file = publicFile(await saveObject(workspacePath, downloaded.bytes, {
        contentType: downloaded.contentType,
        kind: 'generated-model',
        name: downloaded.name,
      }));
      let previewFile = null;
      if (task.output?.rendered_image) {
        try {
          const preview = await downloadProviderAsset(task.output.rendered_image, { maxBytes: 16 * 1024 * 1024 });
          if (preview.contentType.startsWith('image/')) {
            previewFile = publicFile(await saveObject(workspacePath, preview.bytes, {
              contentType: preview.contentType,
              kind: 'generated-preview',
              name: preview.name,
            }));
          }
        } catch { /* optional preview */ }
      }
      return publicGenerationJob(await finishGenerationJob(job.id, {
        result: { ...job.result, file, previewFile, provider: job.provider, task, taskId: job.result.taskId },
      }));
    } catch (error) {
      return publicGenerationJob(await finishGenerationJob(job.id, {
        error: `${job.provider} result could not be stored: ${error?.message ?? String(error)}`,
        result: { ...job.result, task },
      }));
    }
  }
  if (['failed', 'cancelled', 'banned', 'expired'].includes(task.status)) {
    const detail = task.task_error?.message ?? `${job.provider} task ended with status ${task.status}`;
    return publicGenerationJob(await finishGenerationJob(job.id, {
      error: detail,
      result: { ...job.result, provider: job.provider, task, taskId: job.result.taskId },
    }));
  }
  return publicGenerationJob(await updateGenerationJob(job.id, { ...job.result, task }));
}

export async function getManagedGeneration(workspacePath, id) {
  return advanceManagedGeneration(workspacePath, await getGenerationJob(id));
}

export async function listManagedGenerations(options = {}) {
  return Promise.all((await listGenerationJobs(options)).map(publicGenerationJob));
}

export async function saveManagedGeneration(id, { label } = {}) {
  const job = await getGenerationJob(id);
  if (!job) throw new Error('Generation job not found.');
  if (job.status !== 'succeeded') throw new Error(`Generation job is ${job.status}, not succeeded.`);
  if (!['text_to_model', 'image_to_model', 'multiview_to_model'].includes(job.kind) || !job.result?.file) {
    throw new Error('Only succeeded 3D model jobs can be saved as prop assets.');
  }
  const entry = {
    aiGenerated: true,
    description: job.request?.prompt ?? `Generated by ${job.provider}`,
    id: `generation:${job.id}`,
    kind: job.kind,
    label: String(label ?? job.request?.prompt ?? 'Generated prop').slice(0, 120),
    provider: job.provider,
    result: job.result,
    source: 'generate',
    type: 'generated-model',
  };
  return saveLibraryEntry(entry);
}
