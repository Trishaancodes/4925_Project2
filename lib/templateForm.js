// Column types a template can use, with the label shown to users.
const FIELD_TYPES = {
  boolean: 'Checkbox',
  text: 'Text (one line)',
  textarea: 'Text box (multi-line)',
  dropdown: 'Dropdown',
  date: 'Date',
};

const MAX_FIELDS = 50;
const MAX_NAME_LENGTH = 100;

// Form rows arrive as fields[0][name], fields[1][name]... which Express parses into
// an array, or an object once there are many rows. Either way, keep them in order.
function toRows(fields) {
  if (!fields || typeof fields !== 'object') return [];
  return Array.isArray(fields) ? fields : Object.values(fields);
}

// "yes, no, maybe" -> ['yes', 'no', 'maybe'] (trimmed, no blanks, no repeats)
function parseOptions(text) {
  const options = String(text || '').split(',').map((o) => o.trim()).filter(Boolean);
  return [...new Set(options)];
}

// Checks the "new template" form. Returns the cleaned template plus a list of errors.
// `values` is what to show back in the form if there are errors.
function parseTemplateForm(body) {
  const errors = [];
  const name = String(body.name || '').trim();

  if (!name) errors.push('Give the template a name.');
  if (name.length > MAX_NAME_LENGTH) errors.push(`Template name must be ${MAX_NAME_LENGTH} characters or less.`);

  const rows = toRows(body.fields);
  if (rows.length === 0) errors.push('Add at least one column.');
  if (rows.length > MAX_FIELDS) errors.push(`A template can have at most ${MAX_FIELDS} columns.`);

  const seenNames = new Set();
  const fields = rows.slice(0, MAX_FIELDS).map((row, i) => {
    const label = `Column ${i + 1}`;
    const field = {
      name: String(row.name || '').trim(),
      type: String(row.type || ''),
      isRequired: row.required === 'on',
      optionsText: String(row.options || ''),
    };

    if (!field.name) {
      errors.push(`${label}: give it a name.`);
    } else if (field.name.length > MAX_NAME_LENGTH) {
      errors.push(`${label}: name must be ${MAX_NAME_LENGTH} characters or less.`);
    } else if (seenNames.has(field.name.toLowerCase())) {
      errors.push(`${label}: there is already a column called "${field.name}".`);
    }
    seenNames.add(field.name.toLowerCase());

    if (!FIELD_TYPES[field.type]) {
      errors.push(`${label}: pick a valid type.`);
    }

    field.rules = null;
    if (field.type === 'dropdown') {
      const options = parseOptions(field.optionsText);
      if (options.length === 0) errors.push(`${label}: a dropdown needs at least one option.`);
      field.rules = { options };
    }

    return field;
  });

  return {
    errors,
    template: { name, fields },
    values: { name, fields },
  };
}

module.exports = { FIELD_TYPES, parseTemplateForm };
