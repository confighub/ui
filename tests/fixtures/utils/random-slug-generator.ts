// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { generate as generateWords } from 'random-words';
import { generateSlug } from 'random-word-slugs';

export class RandomSlugGenerator {
  /**
   * Generates a random word combination using random-words library
   * Examples: "airplane-mountain", "coffee-keyboard"
   */
  static randomWorkerName(): string {
    const words = generateWords({ exactly: 2, join: '-' });
    const number = Math.floor(Math.random() * 1000);
    return `${words}-${number}`;
  }

  /**
   * Generates a readable slug using random-word-slugs
   * Examples: "brave-elephant", "swift-ocean"
   */
  static randomSlugName(): string {
    return generateSlug(2, { format: 'kebab' });
  }

  /**
   * Generates a longer descriptive name
   * Examples: "clever-mountain-service", "brave-ocean-worker"
   */
  static randomServiceName(): string {
    return generateSlug(3, { 
      format: 'kebab',
      categories: {
        adjective: ['condition', 'personality', 'quantity', 'time', 'appearance'],
        noun: ['profession', 'technology', 'sports', 'place', 'thing']
      }
    });
  }

  /**
   * Generates random test identifiers with timestamp
   * Examples: "test-forest-mountain-1672531200000"
   */
  static randomTestName(): string {
    const slug = generateSlug(2, { format: 'kebab' });
    const timestamp = Date.now();
    return `test-${slug}-${timestamp}`;
  }

  /**
   * Generates names with custom prefix
   * Examples: "api-river-cloud", "worker-brave-sky"
   */
  static randomNameWithPrefix(prefix: string): string {
    const slug = generateSlug(2, { format: 'kebab' });
    return `${prefix}-${slug}`;
  }

  /**
   * Generates multiple unique names using different strategies
   */
  static generateUniqueNames(count: number, generator: () => string): string[] {
    const names = new Set<string>();
    let attempts = 0;
    const maxAttempts = count * 10; // Prevent infinite loops
    
    while (names.size < count && attempts < maxAttempts) {
      names.add(generator());
      attempts++;
    }
    
    return Array.from(names);
  }

  /**
   * Fallback generator that doesn't require external libraries
   * Use this if you can't install npm packages
   */
  static randomFallbackName(): string {
    const adjectives = [
      'swift', 'clever', 'bright', 'calm', 'bold', 'quick', 'smart', 'keen',
      'lively', 'merry', 'proud', 'ready', 'wise', 'brave', 'cool', 'dynamic'
    ];
    
    const nouns = [
      'worker', 'service', 'agent', 'handler', 'processor', 'manager', 'helper',
      'system', 'module', 'component', 'element', 'resource', 'builder', 'creator'
    ];
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    
    return `${adjective}-${noun}-${number}`;
  }

  /**
   * Generate random combination of multiple words
   * Examples: "telescope-bicycle-tornado", "sandwich-volcano-telescope"
   */
  static randomMultiWordName(wordCount: number = 3): string {
    const words = generateWords({ exactly: wordCount, join: '-' });
    return words as string;
  }

  /**
   * Generate camelCase names for certain contexts
   * Examples: "brightMountainService", "swiftOceanWorker"  
   */
  static randomCamelCaseName(): string {
    const slug = generateSlug(3, { format: 'camel' });
    return slug;
  }
}