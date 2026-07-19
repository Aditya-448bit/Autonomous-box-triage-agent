const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*', // Configure for production
  methods: ['GET', 'POST']
}));
app.use(express.json({ limit: '10kb' })); // Limit JSON payload size

/**
 * Classifies an email into a category and suggests an action.
 * This is a rule-based classifier that can be extended with ML models.
 *
 * @param {Object} email - The email object with from, subject, and body properties.
 * @returns {{category: string, action: string, confidence: number}} The category, suggested action, and confidence score.
 */
function classifyEmail(email) {
  const { from, subject, body } = email;
  const text = `${from} ${subject} ${body}`.toLowerCase();

  // Define classification rules with weights for confidence scoring
  const rules = [
    {
      category: 'Urgent',
      keywords: [/urgent/i, /asap/i, /important/i, /break/i, /emergency/i, /urgent action required/i, /deadline/i, /call now/i],
      action: 'Mark as important and notify immediately',
      weight: 1.0
    },
    {
      category: 'Newsletter',
      keywords: [/newsletter/i, /newsletter:/i, /newsletter-/i, /unsubscribe/i, /subscribe/i, /weekly/i, /digest/i, /subscription/i],
      action: 'Apply Newsletter label and consider archiving after reading',
      weight: 0.9
    },
    {
      category: 'Promotion',
      keywords: [/sale/i, /discount/i, /offer/i, /promo/i, /deal/i, /coupon/i, /limited time/i, /buy now/i, /shop now/i, /free shipping/i, /% off/i],
      action: 'Apply Promotions label and consider skipping inbox',
      weight: 0.85
    },
    {
      category: 'Social',
      keywords: [/facebook/i, /twitter/i, /linkedin/i, /instagram/i, /social/i, /friend request/i, /connection request/i, /event invitation/i, /follow/i, /like/i],
      action: 'Apply Social label and consider checking during breaks',
      weight: 0.8
    },
    {
      category: 'Spam',
      keywords: [/viagra/i, /lottery/i, /winner/i, /congratulations/i, /click here/i, /free money/i, /make money fast/i, /work from home/i, /earn cash/i, /no cost/i],
      action: 'Move to Spam folder and report as spam',
      weight: 0.95
    }
  ];

  // Check each rule category
  for (const rule of rules) {
    const matches = rule.keywords.some(regex => regex.test(text));
    if (matches) {
      // Calculate confidence based on number of keyword matches and rule weight
      const keywordCount = rule.keywords.filter(regex => regex.test(text)).length;
      const confidence = Math.min(0.95, 0.5 + (keywordCount * 0.1)) * rule.weight;

      return {
        category: rule.category,
        action: rule.action,
        confidence: Number(confidence.toFixed(2))
      };
    }
  }

  // Default category (Personal/Primary)
  return {
    category: 'Personal',
    action: 'Apply default label and keep in inbox',
    confidence: 0.6
  }
}

// Triaging endpoint
app.post('/triage', async (req, res) => {
  try {
    // Validate required fields
    const { from, subject, body } = req.body;

    if (!from || !subject || !body) {
      return res.status(400).json({
        error: 'Missing required fields: from, subject, and body are required'
      });
    }

    // Additional validation: ensure strings are not empty
    if (typeof from !== 'string' || from.trim() === '' ||
        typeof subject !== 'string' || subject.trim() === '' ||
        typeof body !== 'string' || body.trim() === '') {
      return res.status(400).json({
        error: 'Fields from, subject, and body must be non-empty strings'
      });
    }

    // Classify the email
    const result = classifyEmail({ from, subject, body });

    // Log for monitoring (in production, use proper logging)
    console.info(`[Triage] ${result.category} - ${from} - ${subject.substring(0, 50)}...`);

    res.json(result);
  } catch (error) {
    console.error('Error in triage endpoint:', error);
    res.status(500).json({
      error: 'Internal server error during email classification'
    });
  }
});

// Health check endpoint with system info
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'autonomous-inbox-triage-agent',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const server = app.listen(port, () => {
  console.log(`🤖 Autonomous Inbox Triage Agent listening at http://localhost:${port}`);
  console.log(`📧 Triage endpoint: POST http://localhost:${port}/triage`);
  console.log(`❤️  Health check: GET http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Received SIGTERM. Shutting down gracefully...');
  server.close(() => {
    console.log('🛑 Process terminated');
  });
});

module.exports = { app, server };