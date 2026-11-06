// The validation engine: checks a list entry against the columns (fields) of a template version.
// Every entry is run through here on the server before it is saved.

const MAX_TEXT_LENGTH = 255;
const MAX_TEXTAREA_LENGTH = 5000;

// A form can send the same name twice (checkbox + hidden "false"); the last value wins.
function lastValue(raw) {
  return Array.isArray(raw) ? raw[raw.length - 1] : raw;
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// Real calendar date in YYYY-MM-DD form (rejects 2026-02-30)
function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function checkLength(text, max) {
  return text.length > max ? `must be ${max} characters or less` : null;
}

// One checker per column type. Each gets the trimmed (non-blank) input and the field's rules,
// and returns { value } to store or { error }.
const TYPE_CHECKERS = {
  boolean(input) {
    const text = String(input).toLowerCase();
    if (['true', 'on', '1', 'yes'].includes(text)) return { value: true };
    if (['false', 'off', '0', 'no'].includes(text)) return { value: false };
    return { error: 'must be yes or no' };
  },

  text(input) {
    const error = checkLength(input, MAX_TEXT_LENGTH);
    return error ? { error } : { value: input };
  },

  textarea(input) {
    const error = checkLength(input, MAX_TEXTAREA_LENGTH);
    return error ? { error } : { value: input };
  },

  dropdown(input, rules) {
    const options = (rules && rules.options) || [];
    return options.includes(input)
      ? { value: input }
      : { error: `must be one of: ${options.join(', ')}` };
  },

  date(input) {
    return isValidDate(input) ? { value: input } : { error: 'must be a real date (YYYY-MM-DD)' };
  },
};

/**
 * Checks raw input against a version's fields.
 * @param fields  rows from template_field: { name, type, is_required, rules }
 * @param getRaw  (field, index) => the raw value submitted for that field
 * @returns { data, errors } - data is the clean object to store as JSON (only known columns;
 *          blank optional columns are left out). errors is [{ field, message }].
 */
function validateEntry(fields, getRaw) {
  const data = {};
  const errors = [];

  fields.forEach((field, index) => {
    const raw = lastValue(getRaw(field, index));
    const checker = TYPE_CHECKERS[field.type];

    if (!checker) {
      errors.push({ field: field.name, message: `${field.name} has an unknown type` });
      return;
    }

    if (isBlank(raw)) {
      if (field.is_required) errors.push({ field: field.name, message: `${field.name} is required` });
      return;
    }

    // Long text keeps its inner spacing; everything else is trimmed
    const input = field.type === 'textarea' ? String(raw).replace(/\r\n/g, '\n').trimEnd() : String(raw).trim();
    const result = checker(input, field.rules);

    if (result.error) {
      errors.push({ field: field.name, message: `${field.name} ${result.error}` });
    } else {
      data[field.name] = result.value;
    }
  });

  return { data, errors };
}

module.exports = { validateEntry, isValidDate, MAX_TEXT_LENGTH, MAX_TEXTAREA_LENGTH };
