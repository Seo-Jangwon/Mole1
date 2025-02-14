/*
 * Copyright (c) 2025 Seo-Jangwon
 * Licensed under MIT License
 */

import {formatNumber} from "../utils/formatters.js";

class AnalyticsService {
  /**
   * Fetches analytics data for a specific test
   * @param {string} testId - The ID of the test to analyze
   * @returns {Promise<Object>} The analytics data
   */
  async fetchAnalytics(testId) {
    try {
      const response = await fetch(`/performanceMeasure/metrics/analysis/${testId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  /**
   * Updates the UI with the analytics data
   * @param {Object} analyticsData - The analytics data from the server
   * @param {Function} updateElement - Function to update UI elements
   */
  updateAnalyticsDisplay(analyticsData, updateElement) {
    try {
      // Update percentiles
      if (analyticsData.percentiles) {
        updateElement('modal-p50-response', `${formatNumber(analyticsData.percentiles.p50)} ms`);
        updateElement('modal-p75-response', `${formatNumber(analyticsData.percentiles.p75)} ms`);
        updateElement('modal-p95-response', `${formatNumber(analyticsData.percentiles.p95)} ms`);
        updateElement('modal-p99-response', `${formatNumber(analyticsData.percentiles.p99)} ms`);
      }

      // Update statistics
      if (analyticsData.statistics) {
        updateElement('modal-std-dev', `${formatNumber(analyticsData.statistics.standardDeviation)} ms`);
        updateElement('modal-cv', `${formatNumber(analyticsData.coefficientOfVariation)}%`);
        updateElement('modal-rt-range',
            `${formatNumber(analyticsData.statistics.max - analyticsData.statistics.min)} ms`);
      }

      // Update outliers and stability
      if (analyticsData.outliers !== undefined) {
        updateElement('modal-outliers', analyticsData.outliers);
      }

      // Update stability score with color coding
      if (analyticsData.stabilityScore !== undefined) {
        const stabilityScoreElement = document.getElementById('modal-stability-score');
        if (stabilityScoreElement) {
          stabilityScoreElement.textContent = String(analyticsData.stabilityScore);
          stabilityScoreElement.className = 'stability-score ' +
              (analyticsData.stabilityScore >= 80 ? 'stability-score-high' :
                  analyticsData.stabilityScore >= 60 ? 'stability-score-medium' :
                      'stability-score-low');
        }
      }
    } catch (error) {
      console.error('Error updating analytics display:', error);
    }
  }
}

// Create singleton instance
export const analyticsService = new AnalyticsService();