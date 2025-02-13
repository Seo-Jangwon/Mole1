/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

/**
 * Formats byte values into human-readable MB format.
 * @param {number} bytes - The number of bytes
 * @returns {string} Formatted string in MB
 */
function formatBytes(bytes) {
  if (!bytes) {
    return '0 MB';
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/**
 * Formats timestamp into time string.
 * Handles both array and string timestamp formats.
 * @param {Array|string} timestamp - Timestamp to format
 * @returns {string} Formatted time string
 */
function formatTime(timestamp) {
  // timestamp가 배열인 경우
  if (Array.isArray(timestamp)) {
    const [year, month, day, hour, minute, second, nano] = timestamp;
    return `${hour}:${minute}:${second}`;
  }
  // 문자열인 경우
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * Formats nanosecond duration to milliseconds.
 * @param {number} nanos - Duration in nanoseconds
 * @returns {string} Formatted duration string
 */
function formatDuration(nanos) {
  if (nanos == null) {
    return '-';
  }
  const ms = nanos / 1_000_000;
  return `${ms.toFixed(2)} ms`;
}

/**
 * Formats numeric values with consistent precision.
 * @param {number} value - Number to format
 * @returns {string} Formatted number string
 */
function formatNumber(value) {
  if (value == null) {
    return '-';
  }
  return typeof value === 'number' ? value.toFixed(2) : value;
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} unsafe - Raw string that might contain HTML
 * @returns {string} Escaped safe HTML string
 */
function escapeHtml(unsafe) {
  if (unsafe == null) {
    return '';
  }
  return unsafe
  .toString()
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");
}

/**
 * Calculates and formats time duration between two dates.
 * @param {Date} startTime - Start timestamp
 * @param {Date} endTime - End timestamp
 * @returns {string} Formatted duration string
 */
function calculateDuration(startTime, endTime) {
  if (!startTime) {
    return '0 seconds';
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diff = (end - start) / 1000;
  return `${diff.toFixed(1)} seconds`;
}

/**
 * Gets test status text based on current state.
 * @param {Object} status - Test status object
 * @returns {string} Human-readable status text
 */
function getStatusText(status) {
  if (!status) {
    return '-';
  }
  if (status.status === 'ERROR') {
    return 'Error';
  }
  if (status.status === 'TIMEOUT') {
    return 'Timeout';
  }
  if (status.completed) {
    return 'Completed';
  }
  return 'Running';
}

/**
 * Gets appropriate CSS class for test status.
 * @param {Object} status - Test status object
 * @returns {string} CSS class name
 */
function getStatusClass(status) {
  if (!status) {
    return '';
  }
  if (status.status === 'ERROR' || status.status === 'TIMEOUT') {
    return 'table-danger';
  }
  if (status.completed) {
    return status.errorRate > 10 ? 'table-warning' : 'table-success';
  }
  return 'table-info';
}

function getBadgeClass(status) {
  if (!status) {
    return 'secondary';
  }

  switch (status.status) {
    case 'ERROR':
    case 'TIMEOUT':
      return 'danger';
    case 'COMPLETED':
      return status.errorRate > 10 ? 'warning' : 'success';
    case 'STOP_TEST':
      return 'warning';
    case 'RUNNING':
      return 'info';
    default:
      return 'secondary';
  }
}

export {
  formatBytes,
  formatTime,
  formatDuration,
  formatNumber,
  escapeHtml,
  calculateDuration,
  getStatusText,
  getStatusClass,
  getBadgeClass
};