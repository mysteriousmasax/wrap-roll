/**
 * Payment Client Service
 * Handles payment processing with secure Pesapal integration
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class PaymentClient {
  /**
   * Get available payment methods
   * @returns {Promise<Array>} List of payment methods
   */
  static async getPaymentMethods() {
    try {
      const response = await fetch(`${API_BASE_URL}/payments/methods`);
      if (!response.ok) throw new Error('Failed to fetch payment methods');
      const data = await response.json();
      return data.methods || [];
    } catch (error) {
      console.error('Payment methods fetch failed:', error);
      throw error;
    }
  }

  /**
   * Initiate a payment order
   * @param {object} orderData - Order information
   * @returns {Promise<object>} Payment initiation response
   */
  static async initiatePayment(orderData) {
    const {
      orderId,
      amount,
      currency = 'TZS',
      description,
      customerEmail,
      customerPhone,
      paymentMethod,
    } = orderData;

    // Validate required fields
    if (!orderId || !amount || !customerEmail || !paymentMethod) {
      throw new Error('Missing required payment information');
    }

    // Validate email format
    if (!this.isValidEmail(customerEmail)) {
      throw new Error('Invalid email address');
    }

    // Validate phone format (basic)
    if (customerPhone && customerPhone.length < 9) {
      throw new Error('Invalid phone number');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/payments/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          amount: parseFloat(amount),
          currency,
          description,
          customerEmail,
          customerPhone,
          paymentMethod,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment initiation failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Payment initiation failed:', error);
      throw error;
    }
  }

  /**
   * Check payment status
   * @param {string} paymentId - Payment ID
   * @returns {Promise<object>} Payment status
   */
  static async checkPaymentStatus(paymentId) {
    try {
      const response = await fetch(`${API_BASE_URL}/payments/${paymentId}/status`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Status check failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Payment status check failed:', error);
      throw error;
    }
  }

  /**
   * Process refund
   * @param {string} paymentId - Payment ID
   * @param {object} refundData - Refund information
   * @returns {Promise<object>} Refund result
   */
  static async requestRefund(paymentId, refundData) {
    const { reason, amount } = refundData;

    try {
      const response = await fetch(`${API_BASE_URL}/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('wraproll_token')}`,
        },
        body: JSON.stringify({
          reason,
          amount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Refund request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Refund request failed:', error);
      throw error;
    }
  }

  /**
   * Poll payment status until completion
   * @param {string} paymentId - Payment ID
   * @param {number} maxAttempts - Maximum polling attempts
   * @param {number} interval - Poll interval in ms
   * @returns {Promise<object>} Final payment status
   */
  static async pollPaymentStatus(paymentId, maxAttempts = 60, interval = 2000) {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.checkPaymentStatus(paymentId);

          if (status.status === 'completed' || status.status === 'paid') {
            resolve(status);
            return;
          }

          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error('Payment verification timeout'));
            return;
          }

          setTimeout(poll, interval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {boolean} Validation result
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Format currency for display
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code
   * @returns {string} Formatted amount
   */
  static formatCurrency(amount, currency = 'TZS') {
    const symbols = {
      TZS: 'TSh ',
      USD: '$ ',
      KES: 'KSh ',
    };
    const symbol = symbols[currency] || currency + ' ';
    return symbol + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
}

export default PaymentClient;
