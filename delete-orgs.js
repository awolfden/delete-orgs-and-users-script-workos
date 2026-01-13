#!/usr/bin/env node

/**
 * WorkOS Bulk Deletion Script
 *
 * High-performance script for deleting WorkOS organizations and users at scale.
 * Fully optimized for WorkOS API rate limit: 50 requests per second.
 *
 * Features:
 * - Concurrent deletions (default: 40 parallel operations)
 * - Token bucket rate limiter (40 req/s default, 80% safety margin)
 * - Real-time visual progress bar with live metrics
 * - Throughput: ~2,400 deletions per minute
 * - Dry run mode for safe testing
 * - Debug mode for troubleshooting
 *
 * Performance:
 * - 1,000 deletions: ~25 seconds
 * - 10,000 deletions: ~4 minutes
 * - 100,000 deletions: ~42 minutes
 *
 * Usage:
 *   node delete-orgs.js <date>                  Single date (orgs only)
 *   node delete-orgs.js <start> <end>           Date range (orgs only)
 *   node delete-orgs.js --users <date>          Single date (orgs and users)
 *   node delete-orgs.js --users <start> <end>   Date range (orgs and users)
 *   node delete-orgs.js --dry-run <date>        Test without deleting
 *
 * Environment Variables:
 *   WORKOS_API_KEY           Your WorkOS API key (required)
 *   CONCURRENCY              Max concurrent deletions (default: 40)
 *   MAX_REQUESTS_PER_SECOND  Max requests per second (default: 40, limit: 50)
 */

import 'dotenv/config';
import { WorkOS } from '@workos-inc/node';
import cliProgress from 'cli-progress';

// Initialize WorkOS client with API key from environment variable
const workos = new WorkOS(process.env.WORKOS_API_KEY);

// Configuration - optimized for 50 req/s API limit
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY) || 40;
const MAX_REQUESTS_PER_SECOND = parseInt(process.env.MAX_REQUESTS_PER_SECOND) || 40;

/**
 * Token Bucket Rate Limiter - optimized for high throughput (50 req/s)
 * Uses 80% of capacity by default (40 req/s) for safety margin
 */
class TokenBucketRateLimiter {
  constructor(maxRequestsPerSecond = 40) {
    this.capacity = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond; // tokens per second
    this.lastRefill = Date.now();
  }

  refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquireToken() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refillTokens();

        if (this.tokens >= 1) {
          this.tokens -= 1;
          resolve();
        } else {
          // Calculate wait time based on refill rate
          const waitTime = Math.ceil(1000 / this.refillRate);
          setTimeout(tryAcquire, waitTime);
        }
      };

      tryAcquire();
    });
  }

  /**
   * Get current token availability (for debugging)
   */
  getAvailableTokens() {
    this.refillTokens();
    return Math.floor(this.tokens);
  }
}

// Create rate limiter instance
const rateLimiter = new TokenBucketRateLimiter(MAX_REQUESTS_PER_SECOND);

/**
 * Parse and validate command line arguments
 */
function parseArguments() {
  let args = process.argv.slice(2);

  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Check for --users flag
  const deleteUsers = args.includes('--users');
  args = args.filter(arg => arg !== '--users');

  // Check for --debug flag
  const debug = args.includes('--debug');
  args = args.filter(arg => arg !== '--debug');

  // Check for --dry-run flag
  const dryRun = args.includes('--dry-run');
  args = args.filter(arg => arg !== '--dry-run');

  // Check if date argument is provided
  if (args.length === 0) {
    console.error('❌ Error: Date argument is required.\n');
    showHelp();
    process.exit(1);
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  const validateDate = (dateStr) => {
    if (!dateRegex.test(dateStr)) {
      console.error('❌ Error: Invalid date format.');
      console.error('   Expected format: YYYY-MM-DD (e.g., 2005-12-17)\n');
      process.exit(1);
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.error('❌ Error: Invalid date provided.');
      console.error('   Please provide a valid date in YYYY-MM-DD format.\n');
      process.exit(1);
    }

    return date;
  };

  // Parse single date or date range
  if (args.length === 1) {
    const date = validateDate(args[0]);
    return {
      mode: 'single',
      date: args[0],
      dateObj: date,
      deleteUsers,
      debug,
      dryRun
    };
  } else if (args.length === 2) {
    const startDate = validateDate(args[0]);
    const endDate = validateDate(args[1]);

    if (startDate > endDate) {
      console.error('❌ Error: Start date must be before or equal to end date.\n');
      process.exit(1);
    }

    return {
      mode: 'range',
      startDate: args[0],
      endDate: args[1],
      startDateObj: startDate,
      endDateObj: endDate,
      deleteUsers,
      debug,
      dryRun
    };
  } else {
    console.error('❌ Error: Too many arguments provided.\n');
    showHelp();
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp() {
  console.log('WorkOS Bulk Deletion Script');
  console.log('');
  console.log('High-performance deletion optimized for 50 requests per second');
  console.log('Default throughput: ~2,400 deletions per minute');
  console.log('');
  console.log('Usage:');
  console.log('  node delete-orgs.js [options] <date>');
  console.log('  node delete-orgs.js [options] <start> <end>');
  console.log('');
  console.log('Arguments:');
  console.log('  <date>        Single date in YYYY-MM-DD format');
  console.log('  <start>       Start date for range in YYYY-MM-DD format');
  console.log('  <end>         End date for range in YYYY-MM-DD format (inclusive)');
  console.log('');
  console.log('Options:');
  console.log('  --users       Also delete users created on the specified date(s)');
  console.log('  --dry-run     Show what would be deleted without actually deleting');
  console.log('  --debug       Show detailed debug information');
  console.log('  -h, --help    Show this help message');
  console.log('');
  console.log('Environment Variables:');
  console.log('  WORKOS_API_KEY              Your WorkOS API key (required)');
  console.log('  CONCURRENCY                 Max concurrent deletions (default: 40)');
  console.log('  MAX_REQUESTS_PER_SECOND     Max API requests per second (default: 40, limit: 50)');
  console.log('');
  console.log('Examples:');
  console.log('  node delete-orgs.js 2005-12-17');
  console.log('  node delete-orgs.js --users 2005-12-17 2005-12-25');
  console.log('  node delete-orgs.js --dry-run 2005-12-17');
  console.log('  CONCURRENCY=50 node delete-orgs.js 2005-12-17');
  console.log('');
  console.log('Performance:');
  console.log('  - Default settings: ~2400 deletions/minute');
  console.log('  - 1,000 deletions: ~25 seconds');
  console.log('  - 10,000 deletions: ~4 minutes');
  console.log('  - 100,000 deletions: ~40 minutes');
  console.log('');
}

// Get target date/range from command line arguments
const dateFilter = parseArguments();

/**
 * Check if an entity was created within the target date/range
 */
function matchesDateFilter(createdAt) {
  const createdDate = new Date(createdAt);
  const year = createdDate.getUTCFullYear();
  const month = String(createdDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(createdDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  if (dateFilter.mode === 'single') {
    return dateStr === dateFilter.date;
  } else {
    return dateStr >= dateFilter.startDate && dateStr <= dateFilter.endDate;
  }
}

/**
 * Execute API call with rate limiting and retry logic
 */
async function executeWithRateLimit(apiCall, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rateLimiter.acquireToken();
      return await apiCall();
    } catch (error) {
      // Rate limit error (429)
      if (error.status === 429 && attempt < maxRetries) {
        const backoffTime = Math.pow(2, attempt) * 1000;
        if (dateFilter.debug) {
          console.log(`   ⏳ Rate limit hit. Backing off for ${backoffTime / 1000}s (attempt ${attempt}/${maxRetries})...`);
        }
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Fetch all organizations with pagination (optimized)
 */
async function fetchAllOrganizations() {
  console.log('📋 Fetching all organizations...\n');

  const allOrganizations = [];
  let after = null;
  let pageCount = 0;
  const startTime = Date.now();

  try {
    do {
      pageCount++;
      const params = {
        limit: 100,
        order: 'desc'
      };

      if (after) {
        params.after = after;
      }

      if (dateFilter.debug) {
        console.log(`   Fetching page ${pageCount}...`);
      }

      const response = await executeWithRateLimit(() =>
        workos.organizations.listOrganizations(params)
      );

      if (response.data && response.data.length > 0) {
        allOrganizations.push(...response.data);
        if (dateFilter.debug) {
          console.log(`   ✓ Retrieved ${response.data.length} organizations (total: ${allOrganizations.length})`);
        }
      }

      after = response.listMetadata?.after || null;

    } while (after);

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Fetched ${allOrganizations.length} organizations in ${fetchTime}s\n`);
    return allOrganizations;

  } catch (error) {
    console.error('❌ Error fetching organizations:', error.message);
    throw error;
  }
}

/**
 * Fetch all users with pagination (optimized)
 */
async function fetchAllUsers() {
  console.log('📋 Fetching all users...\n');

  const allUsers = [];
  let after = null;
  let pageCount = 0;
  const startTime = Date.now();

  try {
    do {
      pageCount++;
      const params = {
        limit: 100,
        order: 'desc'
      };

      if (after) {
        params.after = after;
      }

      if (dateFilter.debug) {
        console.log(`   Fetching page ${pageCount}...`);
      }

      const response = await executeWithRateLimit(() =>
        workos.userManagement.listUsers(params)
      );

      if (response.data && response.data.length > 0) {
        allUsers.push(...response.data);
        if (dateFilter.debug) {
          console.log(`   ✓ Retrieved ${response.data.length} users (total: ${allUsers.length})`);
        }
      }

      after = response.listMetadata?.after || null;

    } while (after);

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✓ Fetched ${allUsers.length} users in ${fetchTime}s\n`);
    return allUsers;

  } catch (error) {
    console.error('❌ Error fetching users:', error.message);
    throw error;
  }
}

/**
 * Filter entities by target date/range
 */
function filterByDate(entities, entityType = 'organization') {
  const filterDescription = dateFilter.mode === 'single'
    ? `on ${dateFilter.date}`
    : `between ${dateFilter.startDate} and ${dateFilter.endDate}`;

  console.log(`🔍 Filtering ${entityType}s created ${filterDescription}...\n`);

  const filtered = entities.filter(entity => {
    if (!entity.createdAt) {
      console.log(`   ⚠️  ${entityType} ${entity.id} has no createdAt field`);
      return false;
    }
    return matchesDateFilter(entity.createdAt);
  });

  console.log(`✓ Found ${filtered.length} ${entityType}(s) to delete\n`);

  if (filtered.length > 0 && (dateFilter.debug || filtered.length <= 20)) {
    console.log(`${entityType}s to be deleted:`);
    const displayCount = Math.min(filtered.length, 20);
    for (let i = 0; i < displayCount; i++) {
      const entity = filtered[i];
      const name = entityType === 'organization'
        ? (entity.name || 'Unnamed')
        : (entity.firstName && entity.lastName ? `${entity.firstName} ${entity.lastName}` : entity.email || 'Unnamed');
      console.log(`   ${i + 1}. ${name} (ID: ${entity.id})`);
    }
    if (filtered.length > 20) {
      console.log(`   ... and ${filtered.length - 20} more`);
    }
    console.log('');
  }

  return filtered;
}

/**
 * Progress tracker for concurrent operations with visual progress bar
 */
class ProgressTracker {
  constructor(total, entityType) {
    this.total = total;
    this.entityType = entityType;
    this.completed = 0;
    this.successful = 0;
    this.failed = 0;
    this.startTime = Date.now();

    // Create progress bar with custom format
    this.progressBar = new cliProgress.SingleBar({
      format: `   Deleting ${entityType}s |{bar}| {percentage}% | {value}/{total} | ✓ {successful} ❌ {failed} | {speed} | ETA: {eta_formatted}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true
    }, cliProgress.Presets.shades_classic);

    // Start the progress bar
    this.progressBar.start(total, 0, {
      successful: 0,
      failed: 0,
      speed: '0/s'
    });
  }

  update(success) {
    this.completed++;
    if (success) {
      this.successful++;
    } else {
      this.failed++;
    }

    // Calculate speed
    const elapsed = (Date.now() - this.startTime) / 1000;
    const rate = this.completed / elapsed;
    const speedDisplay = rate >= 1 ? `${rate.toFixed(1)}/s` : `${(rate * 60).toFixed(1)}/min`;

    // Update the progress bar
    this.progressBar.update(this.completed, {
      successful: this.successful,
      failed: this.failed,
      speed: speedDisplay
    });

    // Handle completion
    if (this.completed === this.total) {
      this.progressBar.stop();
      const totalTime = elapsed.toFixed(1);
      const avgRate = (this.total / elapsed).toFixed(1);
      console.log(`\n✓ Completed ${this.total} ${this.entityType} deletions in ${totalTime}s (avg: ${avgRate}/s)\n`);
    }
  }
}

/**
 * Delete multiple entities concurrently with controlled concurrency
 */
async function deleteEntitiesConcurrently(entities, deleteFunction, entityType) {
  if (entities.length === 0) {
    console.log(`✓ No ${entityType}s to delete.\n`);
    return { successful: [], failed: [] };
  }

  if (dateFilter.dryRun) {
    console.log(`🔍 DRY RUN: Would delete ${entities.length} ${entityType}(s)\n`);
    return {
      successful: entities.map(e => ({
        id: e.id,
        name: entityType === 'organization' ? (e.name || 'Unnamed') : (e.email || 'Unnamed'),
        createdAt: e.createdAt
      })),
      failed: []
    };
  }

  const estimatedTime = Math.ceil(entities.length / MAX_REQUESTS_PER_SECOND);
  console.log(`🗑️  Deleting ${entities.length} ${entityType}(s)...`);
  console.log(`   Concurrency: ${CONCURRENCY_LIMIT} parallel operations`);
  console.log(`   Rate limit: ${MAX_REQUESTS_PER_SECOND} req/s`);
  console.log(`   Estimated time: ~${estimatedTime}s\n`);

  const results = {
    successful: [],
    failed: []
  };

  const progress = new ProgressTracker(entities.length, entityType);

  // Process deletions with controlled concurrency
  const processingQueue = [];

  for (const entity of entities) {
    // Wait if we've hit the concurrency limit
    if (processingQueue.length >= CONCURRENCY_LIMIT) {
      await Promise.race(processingQueue);
    }

    // Start deletion
    const deletionPromise = (async () => {
      const name = entityType === 'organization'
        ? (entity.name || 'Unnamed')
        : (entity.firstName && entity.lastName ? `${entity.firstName} ${entity.lastName}` : entity.email || 'Unnamed');

      try {
        await executeWithRateLimit(() => deleteFunction(entity.id));

        results.successful.push({
          id: entity.id,
          name: name,
          createdAt: entity.createdAt
        });
        progress.update(true);
      } catch (error) {
        results.failed.push({
          id: entity.id,
          name: name,
          createdAt: entity.createdAt,
          error: error.message
        });
        progress.update(false);

        if (dateFilter.debug) {
          console.log(`\n   ❌ Failed to delete ${name}: ${error.message}`);
        }
      }
    })();

    processingQueue.push(deletionPromise);

    // Remove completed promises from the queue
    deletionPromise.finally(() => {
      const index = processingQueue.indexOf(deletionPromise);
      if (index > -1) {
        processingQueue.splice(index, 1);
      }
    });
  }

  // Wait for all remaining deletions to complete
  await Promise.all(processingQueue);

  return results;
}

/**
 * Print final summary
 */
function printSummary(orgResults, userResults = null) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    DELETION SUMMARY                        ');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (dateFilter.dryRun) {
    console.log('🔍 DRY RUN MODE - No actual deletions were performed\n');
  }

  // Organizations summary
  console.log('Organizations:');
  console.log(`  ✓ Successfully deleted: ${orgResults.successful.length}`);
  console.log(`  ❌ Failed to delete:    ${orgResults.failed.length}`);
  console.log(`  📊 Total processed:     ${orgResults.successful.length + orgResults.failed.length}\n`);

  // Users summary (if applicable)
  if (userResults) {
    console.log('Users:');
    console.log(`  ✓ Successfully deleted: ${userResults.successful.length}`);
    console.log(`  ❌ Failed to delete:    ${userResults.failed.length}`);
    console.log(`  📊 Total processed:     ${userResults.successful.length + userResults.failed.length}\n`);
  }

  // Show failures if any (up to 10)
  if (orgResults.failed.length > 0) {
    console.log('Failed organization deletions:');
    const displayCount = Math.min(orgResults.failed.length, 10);
    for (let i = 0; i < displayCount; i++) {
      const org = orgResults.failed[i];
      console.log(`   ${i + 1}. ${org.name} (${org.id})`);
      console.log(`      Error: ${org.error}`);
    }
    if (orgResults.failed.length > 10) {
      console.log(`   ... and ${orgResults.failed.length - 10} more failures`);
    }
    console.log('');
  }

  if (userResults && userResults.failed.length > 0) {
    console.log('Failed user deletions:');
    const displayCount = Math.min(userResults.failed.length, 10);
    for (let i = 0; i < displayCount; i++) {
      const user = userResults.failed[i];
      console.log(`   ${i + 1}. ${user.name} (${user.id})`);
      console.log(`      Error: ${user.error}`);
    }
    if (userResults.failed.length > 10) {
      console.log(`   ... and ${userResults.failed.length - 10} more failures`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════\n');
}

/**
 * Main execution
 */
async function main() {
  const targetDescription = dateFilter.mode === 'single'
    ? `on ${dateFilter.date}`
    : `between ${dateFilter.startDate} and ${dateFilter.endDate} (inclusive)`;

  const deleteUsersFlag = dateFilter.deleteUsers;
  const targetTypes = deleteUsersFlag ? 'organizations and users' : 'organizations';

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('            WorkOS Bulk Deletion Script                   ');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Target: Delete ${targetTypes} created ${targetDescription}`);
  console.log(`Concurrency: ${CONCURRENCY_LIMIT} parallel operations`);
  console.log(`Rate limit: ${MAX_REQUESTS_PER_SECOND} requests/second (API limit: 50/s)`);
  console.log(`Throughput: ~${Math.floor(MAX_REQUESTS_PER_SECOND * 60)} deletions/minute`);
  if (dateFilter.dryRun) {
    console.log('Mode: DRY RUN (no actual deletions)');
  }
  console.log('');

  // Validate API key
  if (!process.env.WORKOS_API_KEY) {
    console.error('❌ Error: WORKOS_API_KEY environment variable is not set.');
    console.error('   Please set it with: export WORKOS_API_KEY="your-api-key"\n');
    process.exit(1);
  }

  try {
    const startTime = Date.now();

    // Fetch and delete organizations
    const allOrganizations = await fetchAllOrganizations();
    const organizationsToDelete = filterByDate(allOrganizations, 'organization');
    const orgResults = await deleteEntitiesConcurrently(
      organizationsToDelete,
      (id) => workos.organizations.deleteOrganization(id),
      'organization'
    );

    let userResults = null;

    // If --users flag is set, also handle users
    if (deleteUsersFlag) {
      const allUsers = await fetchAllUsers();
      const usersToDelete = filterByDate(allUsers, 'user');
      userResults = await deleteEntitiesConcurrently(
        usersToDelete,
        (id) => workos.userManagement.deleteUser(id),
        'user'
      );
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️  Total execution time: ${totalTime}s\n`);

    // Print summary
    printSummary(orgResults, userResults);

    // Exit with appropriate code
    const totalFailed = orgResults.failed.length + (userResults ? userResults.failed.length : 0);
    process.exit(totalFailed > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Script failed with error:', error.message);
    if (dateFilter.debug && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run the script
main();
