import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffleVideoItems } from './videoShuffle.js';

const videos = Array.from({ length: 40 }, (_, index) => ({ productId: index + 1, src: `https://video.test/${index + 1}.mp4` }));
const keyForVideo = (video: typeof videos[number]) => `${video.productId}:${video.src}`;

test('video order stays stable for the same seed and changes for a new seed', () => {
  const first = shuffleVideoItems(videos, 'visitor-session-one', keyForVideo);
  const repeat = shuffleVideoItems(videos, 'visitor-session-one', keyForVideo);
  const nextSession = shuffleVideoItems(videos, 'visitor-session-two', keyForVideo);

  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, nextSession);
});

test('randomized pages contain every video once without duplicates', () => {
  const shuffled = shuffleVideoItems(videos, 'pagination-seed', keyForVideo);
  const pages = [shuffled.slice(0, 12), shuffled.slice(12, 24), shuffled.slice(24, 36), shuffled.slice(36, 48)];
  const paginated = pages.flat();

  assert.equal(paginated.length, videos.length);
  assert.equal(new Set(paginated.map(keyForVideo)).size, videos.length);
  assert.deepEqual(paginated, shuffled);
});
