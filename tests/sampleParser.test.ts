import { describe, it, expect } from 'vitest';
import {  samplesParser_decode, samplesParser_encode } from '~/lib/parsers/device_storage_parser';
import {canonicalize} from '~/lib/utils/canonicalize';

describe('Samples Parser', () => {
  it('should encode and decode sample packs symmetrically', () => {
    // Generate dummy sample pack
    const originalSamplePack = generateDummySamples();
    const originalSamplePackCanonical = canonicalize(originalSamplePack);

    // Encode the sample pack
    const encodedData = samplesParser_encode(originalSamplePack);

    console.log(encodedData)

    // Decode the encoded data
    const decodedSamplePack = samplesParser_decode(encodedData);
    const decodedSamplePackCanonical = canonicalize(decodedSamplePack);

    // Compare the original and decoded sample packs
    expect(decodedSamplePackCanonical).toEqual(originalSamplePackCanonical);
  });
});
