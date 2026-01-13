# WorkOS Bulk Deletion Script

High-performance Node.js script for deleting WorkOS organizations and users at scale. Fully optimized for WorkOS's 50 requests/second API limit with real-time progress visualization.

## ⚡ Performance

- **~2,400 deletions per minute** (default settings)
- **40 concurrent operations** with token bucket rate limiting
- **Real-time progress bar** with live metrics
- Handles 100,000+ deletions efficiently

**Performance examples:**

- 1,000 deletions: ~25 seconds
- 10,000 deletions: ~4 minutes
- 100,000 deletions: ~42 minutes

## ✨ Features

- 📊 **Real-time visual progress bar** with animated display
- 🚀 **High-throughput concurrent deletions** (40 parallel operations)
- 📈 **Token bucket rate limiter** optimized for 50 req/s API limit
- ⏱️ **Live metrics**: Speed (req/s), ETA, success/failure counts
- 🧪 **Dry run mode** - test filtering without deleting
- 🐛 **Debug mode** - detailed logging for troubleshooting
- 🔄 **Automatic retry logic** with exponential backoff
- 📅 **Flexible date filtering** - single date or date range
- 👥 **Supports both organizations and users**
- ⚙️ **Configurable concurrency and rate limits**

## Prerequisites

- Node.js v14 or higher
- WorkOS API key

## Installation

```bash
npm install
```

## Usage

### Quick Start

1. Set your WorkOS API key:

```bash
export WORKOS_API_KEY="your-api-key-here"
```

2. **Always test with dry run first:**

```bash
npm start -- --dry-run 2005-12-17
```

3. Run the actual deletion:

```bash
npm start 2005-12-17
```

### Examples

**Delete organizations from a single date:**

```bash
node delete-orgs.js 2005-12-17
```

**Delete organizations from a date range:**

```bash
node delete-orgs.js 2005-12-17 2005-12-25
```

**Delete both organizations and users:**

```bash
node delete-orgs.js --users 2005-12-17
```

**Dry run (see what would be deleted without deleting):**

```bash
node delete-orgs.js --dry-run 2005-12-17
```

**Debug mode (detailed logging):**

```bash
node delete-orgs.js --debug 2005-12-17
```

**Maximum performance (for large batches):**

```bash
CONCURRENCY=50 MAX_REQUESTS_PER_SECOND=48 node delete-orgs.js 2005-12-17
```

### Using npm scripts

```bash
# Standard run
npm start 2005-12-17

# With options (note the --)
npm start -- --users 2005-12-17
npm start -- --dry-run 2005-12-17 2005-12-25

# Get help
npm run help

# See progress bar demo
npm run demo
```

## Configuration

### Environment Variables

- `WORKOS_API_KEY` (required) - Your WorkOS API key
- `CONCURRENCY` (optional) - Max concurrent operations (default: 40)
- `MAX_REQUESTS_PER_SECOND` (optional) - Rate limit (default: 40, max: 50)

### Command-Line Options

- `<date>` - Single date in YYYY-MM-DD format
- `<start> <end>` - Date range (inclusive)
- `--users` - Also delete users (in addition to organizations)
- `--dry-run` - Show what would be deleted without deleting
- `--debug` - Show detailed debug information
- `-h, --help` - Show help message

## Configuration Presets

### Conservative (high reliability)

```bash
CONCURRENCY=20 MAX_REQUESTS_PER_SECOND=30 node delete-orgs.js 2005-12-17
```

- Throughput: ~1,800 deletions/minute
- Best for: First-time use, production environments
- Risk: Very low

### Balanced (default, recommended)

```bash
node delete-orgs.js 2005-12-17
```

- Throughput: ~2,400 deletions/minute
- Best for: Most scenarios
- Risk: Low

### Aggressive (maximum performance)

```bash
CONCURRENCY=50 MAX_REQUESTS_PER_SECOND=48 node delete-orgs.js 2005-12-17
```

- Throughput: ~2,880 deletions/minute
- Best for: Large batches (10,000+), time-critical operations
- Risk: Small chance of rate limiting

## What You'll See

### Before Deletion

```
═══════════════════════════════════════════════════════════
   WorkOS Deletion Script (OPTIMIZED FOR SCALE)
═══════════════════════════════════════════════════════════

Target: Delete organizations created on 2005-12-17
Concurrency: 40 parallel operations
Rate limit: 40 requests/second (API limit: 50/s)
Throughput: ~2400 deletions/minute

📋 Fetching all organizations...
✓ Fetched 5,432 organizations in 2.3s

🔍 Filtering organizations created on 2005-12-17...
✓ Found 1,000 organizations to delete

🗑️  Deleting 1000 organizations...
   Concurrency: 40 parallel operations
   Rate limit: 40 req/s
   Estimated time: ~25s
```

### During Deletion (live updates)

```
   Deleting organizations |████████████████████░░░░░░░░| 65.4% | 654/1000 | ✓ 651 ❌ 3 | 42.3/s | ETA: 8s
```

### After Completion

```
   Deleting organizations |████████████████████████████| 100% | 1000/1000 | ✓ 997 ❌ 3 | 40.1/s | ETA: 0s

✓ Completed 1000 organization deletions in 24.9s (avg: 40.1/s)

⏱️  Total execution time: 27.8s

═══════════════════════════════════════════════════════════
                    DELETION SUMMARY
═══════════════════════════════════════════════════════════

Organizations:
  ✓ Successfully deleted: 997
  ❌ Failed to delete:    3
  📊 Total processed:     1000

Failed organization deletions:
   1. Org ABC (org_123456) - Error: Network timeout
   2. Org XYZ (org_789012) - Error: Resource not found
   3. Org DEF (org_345678) - Error: Rate limit exceeded

═══════════════════════════════════════════════════════════
```

## How It Works

### Architecture

1. **Token Bucket Rate Limiter**

   - Allows bursts up to 40 requests immediately
   - Refills at 40 tokens/second
   - Maintains average of 40 req/s over time
   - Prevents rate limit errors proactively

2. **Controlled Concurrency**

   - Maintains exactly 40 active operations
   - Starts new operations as slots become available
   - Uses `Promise.race` to wait for first completion
   - Ensures maximum throughput

3. **Progress Tracking**
   - Updates every 100ms for smooth animation
   - Calculates real-time speed and ETA
   - Tracks success/failure counts
   - Minimal performance overhead (<0.1%)

### Error Handling

- **Rate Limit (429) Errors**: Exponential backoff (2s, 4s, 8s)
- **Network Errors**: Retry up to 3 times per operation
- **Isolated Failures**: One failure doesn't affect others
- **Idempotent**: Safe to re-run to catch failures

## Best Practices

### 1. Always Use Dry Run First

```bash
node delete-orgs.js --dry-run 2005-12-17
```

Verify:

- Correct entities are matched
- Expected count
- Date filtering works correctly

### 2. Start Conservative

For your first run, use conservative settings:

```bash
CONCURRENCY=20 node delete-orgs.js 2005-12-17
```

### 3. Monitor Progress

Watch the real-time metrics:

- Speed should stabilize around 35-40/s
- ETA should decrease steadily
- Failure count should be low (<1%)

### 4. Handle Failures

If you see many failures:

1. Check the error messages in the summary
2. Use `--debug` mode to see detailed errors
3. Reduce concurrency/rate limit if needed
4. Re-run the script (idempotent - already deleted entities fail gracefully)

## Troubleshooting

### Too Many Rate Limit Errors

**Problem**: Script frequently backs off due to 429 errors

**Solution**: Reduce rate limit or concurrency

```bash
MAX_REQUESTS_PER_SECOND=30 CONCURRENCY=20 node delete-orgs.js 2005-12-17
```

### Slower Than Expected

**Problem**: Throughput much lower than ~40/s

**Possible causes**:

- Network latency
- API response time variability
- Other processes using the same API key

**Solution**: Use debug mode to investigate

```bash
node delete-orgs.js --debug 2005-12-17
```

### Need More Detail

**Problem**: Want to see exactly what's happening

**Solution**: Use debug mode

```bash
node delete-orgs.js --debug 2005-12-17
```

Shows:

- Each page fetch
- Individual deletion attempts
- Detailed error messages
- Rate limit hits

## Documentation

- **[OPTIMIZATION.md](OPTIMIZATION.md)** - Detailed performance guide with architecture deep dive
- **[PROGRESS-BAR.md](PROGRESS-BAR.md)** - Complete progress bar documentation

## Technical Details

- **Language**: Node.js with ES modules
- **Dependencies**:
  - `@workos-inc/node` - Official WorkOS SDK
  - `cli-progress` - Real-time progress bars
  - `dotenv` - Environment variable management
- **Rate Limiting**: Token bucket algorithm
- **Concurrency**: Promise-based controlled concurrency
- **API Limit**: WorkOS allows 50 requests/second
- **Default Settings**: 40 req/s, 40 concurrent (80% of capacity)

## License

ISC

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review [OPTIMIZATION.md](OPTIMIZATION.md) for configuration help
3. Use `--debug` mode to diagnose issues
4. Review the error messages in the deletion summary

## Version

**v2.0.0** - Optimized for scale with real-time progress visualization

### What's New in v2.0

- 60x performance improvement (40 concurrent operations)
- Real-time visual progress bar with live metrics
- Token bucket rate limiter (40 req/s default)
- Dry run mode for safe testing
- Debug mode for troubleshooting
- Configurable concurrency and rate limits
- Support for deleting both organizations and users
- Comprehensive error handling and retry logic
