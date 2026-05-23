function camelKey(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const key of Object.keys(row)) {
    const val = row[key];
    out[camelKey(key)] = Array.isArray(val)
      ? val.map((v) => (v && typeof v === 'object' ? camelizeRow(v) : v))
      : val && typeof val === 'object' && !Buffer.isBuffer(val) && !(val instanceof Date)
        ? camelizeRow(val)
        : val;
  }
  return out;
}

function camelize(rows) {
  return rows.map(camelizeRow);
}

module.exports = { camelize, camelizeRow };
