#!/usr/bin/env node

/**
 * Demo script to test the progress bar
 * Shows what users will see during deletion operations
 */

import cliProgress from 'cli-progress';

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

// Demo: Simulate deleting 200 organizations
async function runDemo() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('   Progress Bar Demo - Simulating 200 Deletions           ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const total = 200;
  const progress = new ProgressTracker(total, 'organization');

  // Simulate deletions with realistic timing
  for (let i = 0; i < total; i++) {
    // Simulate API call delay (20-30ms per deletion at high concurrency)
    await new Promise(resolve => setTimeout(resolve, 25));

    // Simulate occasional failure (2% failure rate)
    const success = Math.random() > 0.02;
    progress.update(success);
  }

  console.log('Demo completed! This is what users will see during actual deletions.\n');
}

runDemo();
