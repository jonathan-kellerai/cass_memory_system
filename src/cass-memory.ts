#!/usr/bin/env bun
import chalk from 'chalk';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(chalk.bold('cass-memory (cm)'));
  console.log('Universal memory system for AI coding agents.');
  console.log('\nUsage:');
  console.log('  cm context "task description"');
  console.log('  cm mark <rule-id> helpful|harmful');
  console.log('  cm playbook');
  console.log('  cm status');
  process.exit(0);
}

console.log(chalk.green('cass-memory initialized. Run with --help for usage.'));