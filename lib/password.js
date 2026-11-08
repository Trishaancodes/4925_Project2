// Password rules shared by sign up and "change password"
const SALT_ROUNDS = 12;

// Returns a list of problems with the password (empty list = valid)
function checkPassword(password) {
  const problems = [];
  if (password.length < 10) problems.push('Password must be at least 10 characters.');
  if (!/[A-Z]/.test(password)) problems.push('Password needs an uppercase letter.');
  if (!/[a-z]/.test(password)) problems.push('Password needs a lowercase letter.');
  if (!/[0-9]/.test(password)) problems.push('Password needs a number.');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('Password needs a symbol.');
  return problems;
}

module.exports = { SALT_ROUNDS, checkPassword };
