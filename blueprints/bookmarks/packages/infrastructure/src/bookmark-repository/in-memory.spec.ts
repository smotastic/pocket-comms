import { it } from '@effect/vitest';
import { BookmarkRepository } from '../index.js';
import { repositoryContract } from '../testing/repository-contract.js';

repositoryContract('BookmarkRepository.layerInMemory', BookmarkRepository.layerInMemory, it);
