// The right inspector's body for one workflow stage: the stage's settings
// groups rendered through the shared schema components, with UI-side
// advanced flags decorating the canonical field schema.

import {
  TREE_SETTING_FIELD_SCHEMA,
  TREE_SETTING_GROUPS,
} from '../../../../src/vegetation/index.js';
import { readFieldValueFromSettings } from '../../../../src/debug/fieldValues.js';
import { SchemaGroup } from '../../../shared/ui/index.js';
import { isFieldDisabled } from '../fieldRules.js';
import { ADVANCED_FIELD_IDS } from '../stageMap.js';

const GROUPS_BY_ID = Object.fromEntries(TREE_SETTING_GROUPS.map((group) => [group.id, group]));

// Decorated schema (advanced flags) computed once at module load.
const DECORATED_SCHEMA = Object.fromEntries(
  Object.entries(TREE_SETTING_FIELD_SCHEMA).map(([groupId, fields]) => [
    groupId,
    Object.fromEntries(Object.entries(fields).map(([key, field]) => [
      key,
      ADVANCED_FIELD_IDS.has(field.id) ? { ...field, advanced: true } : field,
    ])),
  ]),
);

export function StagePanel({
  actions, flat = false, groupIds, state,
}) {
  return groupIds.map((groupId) => (
    <SchemaGroup
      key={groupId}
      fields={DECORATED_SCHEMA[groupId]}
      flat={flat}
      getValue={(field) => readFieldValueFromSettings(state.settings, field)}
      group={GROUPS_BY_ID[groupId]}
      isDisabled={(field) => isFieldDisabled(state, field)}
      onChange={(field, value) => actions.setField(field, value)}
    />
  ));
}
