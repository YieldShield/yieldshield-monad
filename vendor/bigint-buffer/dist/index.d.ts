/// <reference types="node" />
/**
 * Convert a little-endian buffer into a BigInt.
 */
export declare function toBigIntLE(buf: Buffer): bigint;
/**
 * Convert a big-endian buffer into a BigInt.
 */
export declare function toBigIntBE(buf: Buffer): bigint;
/**
 * Convert a BigInt to a little-endian buffer.
 */
export declare function toBufferLE(num: bigint, width: number): Buffer;
/**
 * Convert a BigInt to a big-endian buffer.
 */
export declare function toBufferBE(num: bigint, width: number): Buffer;
