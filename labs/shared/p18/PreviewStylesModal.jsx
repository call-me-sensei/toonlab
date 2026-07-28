import {
  Button,
  Modal,
  PreviewToggle,
  Select,
} from '../ui/index.js';
import {
  P18_PREVIEW_COMPONENTS,
  P18_PREVIEW_COMPONENT_STYLE_OPTIONS,
  P18_PREVIEW_SCENE_PRESETS,
  P18_PREVIEW_STYLE_BUNDLES,
} from './previewStyles.js';

export function P18PreviewStylesModal({
  actions,
  artifactLabel,
  authoredComponent,
  onClose,
  state,
}) {
  const authoredComponents = new Set(
    (Array.isArray(authoredComponent) ? authoredComponent : [authoredComponent])
      .filter(Boolean),
  );
  const contextComponents = P18_PREVIEW_COMPONENTS
    .filter((component) => !authoredComponents.has(component.id));
  const overrideCount = contextComponents
    .filter((component) => (
      state.preview.componentStyles[component.id] !== 'inherit'
    )).length;

  return (
    <Modal
      onClose={onClose}
      testId="preview-styles-modal"
      title="Preview styles"
      width={680}
    >
      <div className="rock-preview-settings">
        <p>
          Start with one complete style bundle, then override or hide any
          surrounding shader domain. These choices affect only the P18
          comparison scene and are never included in the exported {artifactLabel}.
        </p>
        <div className="rock-preview-settings__primary">
          <label>
            <span>Validation scene</span>
            <Select
              onChange={actions.setPreviewScenePreset}
              options={P18_PREVIEW_SCENE_PRESETS.map((entry) => ({
                label: entry.label,
                value: entry.id,
              }))}
              testId="preview-scene-preset"
              value={state.preview.scenePreset}
            />
          </label>
          <label>
            <span>Style bundle</span>
            <Select
              onChange={actions.setPreviewBundle}
              options={P18_PREVIEW_STYLE_BUNDLES.map((entry) => ({
                label: entry.label,
                value: entry.id,
              }))}
              testId="preview-style-bundle"
              value={state.preview.bundle}
            />
          </label>
        </div>
        <div className="rock-preview-settings__divider" />
        <div className="rock-preview-settings__heading-row">
          <div>
            <div className="rock-preview-settings__heading">Surrounding shaders</div>
            <div className="rock-preview-settings__caption">
              “From bundle” follows the selected bundle. Hide a component to
              isolate the authored shader without changing the saved profile.
            </div>
          </div>
          <span className="rock-preview-settings__override-count">
            {overrideCount} override{overrideCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="rock-preview-settings__domains">
          {contextComponents.map((component) => (
            <label key={component.id}>
              <span>
                <strong>{component.label}</strong>
                <small>{component.description}</small>
              </span>
              <Select
                onChange={(style) => (
                  actions.setPreviewComponentStyle(component.id, style)
                )}
                options={P18_PREVIEW_COMPONENT_STYLE_OPTIONS}
                testId={`preview-style-${component.id}`}
                value={state.preview.componentStyles[component.id]}
              />
              <PreviewToggle
                checked={state.preview.componentVisibility[component.id]}
                label="Show"
                onChange={(visible) => (
                  actions.setPreviewComponentVisible(component.id, visible)
                )}
                testId={`preview-visible-${component.id}`}
                title={`Show or hide ${component.label} in this preview only.`}
              />
            </label>
          ))}
        </div>
        <div className="rock-preview-settings__actions">
          <Button
            kind="secondary"
            onClick={actions.resetPreviewSettings}
            testId="reset-preview-settings"
          >
            Reset preview
          </Button>
          <Button kind="primary" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
