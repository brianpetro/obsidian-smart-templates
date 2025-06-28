/**
 * @function escapeRegExp
 * @description Utility for safely creating a heading match pattern
 * @param {string} str
 * @returns {string}
 */

export function escape_reg_exp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
