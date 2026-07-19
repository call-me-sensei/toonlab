// All-Controls power drawer: every settings group flat (advanced fields
// inline), fuzzy label filter, and the live recipe JSON editor.

import { useMemo, useState } from 'react';
import {
  TREE_SETTING_FIELD_SCHEMA, TREE_SETTING_GROUPS,
} from '../../../../src/vegetation/index.js';
import { readFieldValueFromSettings } from '../../../../src/debug/fieldValues.js';
import {
  Button, SchemaGroup, TextField, toast,
} from '../../../shared/ui/index.js';
import { fieldsForLab, groupForLab, isFieldDisabled } from '../fieldRules.js';

function RecipeJsonEditor({ actions, state }) {
  // Re-derive on every document change; local draft only while editing.
  const liveJson = useMemo(
    () => JSON.stringify(actions.getRecipeDocument(), null, 2),
    [actions, state.docRevision],
  );
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');

  return (
    <section className="tk-section">
      <div className="tk-section-title">Recipe (JSON)</div>
      <textarea
        className="td-json"
        data-testid="recipe-json"
        spellCheck={false}
        value={draft ?? liveJson}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="td-json-actions">
        <Button
          kind="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(draft ?? liveJson);
            toast('Recipe JSON copied', { tone: 'success' });
          }}
        >
          Copy
        </Button>
        <Button
          disabled={draft === null}
          kind="secondary"
          onClick={() => {
            const result = actions.importRecipe(draft);
            if (!result.ok) {
              setError(result.errors.join(' '));
              return;
            }
            setDraft(null);
            setError('');
            toast('Recipe applied', { tone: 'success' });
          }}
          testId="recipe-apply"
        >
          Apply
        </Button>
        {draft !== null && (
          <Button kind="ghost" onClick={() => { setDraft(null); setError(''); }}>Discard</Button>
        )}
      </div>
      {error && <div className="td-json-error">{error}</div>}
    </section>
  );
}

export function PowerDrawer({ actions, labKind = 'tree', state }) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const fieldFilter = (field) => !needle
    || field.label.toLowerCase().includes(needle)
    || field.group.toLowerCase().includes(needle);

  return (
    <>
      <div className="td-inspector-header">All controls</div>
      <div className="td-drawer-filter">
        <TextField
          onCommit={setFilter}
          placeholder="Filter fields…"
          testId="drawer-filter"
          value={filter}
        />
      </div>
      {TREE_SETTING_GROUPS
        .filter((group) => labKind === 'flower' || group.id !== 'flower')
        .map((group) => (
        <SchemaGroup
          key={group.id}
          fieldFilter={fieldFilter}
          fields={fieldsForLab(TREE_SETTING_FIELD_SCHEMA[group.id], labKind)}
          flat
          getValue={(field) => readFieldValueFromSettings(state.settings, field)}
          group={groupForLab(group, labKind)}
          isDisabled={(field) => isFieldDisabled(state, field)}
          onChange={(field, value) => actions.setField(field, value)}
          showCaption={false}
        />
        ))}
      <RecipeJsonEditor actions={actions} state={state} />
    </>
  );
}
