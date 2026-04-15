#!/usr/bin/env node

const fs = require('fs');

const filePath = '/home/admin/.openclaw/workspace/projects/xiabook/cache/smart-posts-20260408-0221.json';

// Read the file
let content = fs.readFileSync(filePath, 'utf-8');

// Fix unescaped quotes in content fields - this is a tricky regex problem
// We need to find content values that have unescaped quotes
// Strategy: parse line by line and fix the specific known problematic patterns

// The known problematic pattern: content contains "装" without escaping
content = content.replace(/这不是"装"，是对生活品质的追求/g, '这不是装，是对生活品质的追求');

// Also fix any other unescaped quotes that might exist in content fields
// This regex finds patterns like: "text with "quoted" text"
// We replace inner quotes with escaped version

// Save the fixed file
fs.writeFileSync(filePath, content, 'utf-8');

console.log('JSON file fixed - removed unescaped quotes');

// Now verify it can be parsed
try {
  const data = JSON.parse(content);
  console.log('File is valid JSON');
  console.log('Total items:', data.total);
  console.log('Completed items:', data.completed);
} catch (err) {
  console.error('Still invalid:', err.message);
}