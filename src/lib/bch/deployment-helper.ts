// BCH Chipnet Contract Deployment Helper
// This utility provides helper functions for deploying CashScript contracts on BCH Chipnet

import { Contract } from 'cashscript';
import fs from 'fs';

/**
 * Instantiate a CashScript contract with the given artifact and constructor arguments
 * @param {Object} artifact - The compiled contract artifact (JSON)
 * @param {Array} args - Constructor arguments (Buffer for bytes, BigInt for int)
 * @returns {Object} Contract instance or error object
 */
export function instantiateContract(artifact: any, args: any[]): any {
  try {
    // Validate argument counts
    if (args.length !== artifact.constructorInputs.length) {
      return {
        error: `Expected ${artifact.constructorInputs.length} args, got ${args.length}`,
      };
    }

    // Validate argument types (basic)
    artifact.constructorInputs.forEach((input: any, i: number) => {
      const arg = args[i];
      if (input.type.startsWith('bytes') && !Buffer.isBuffer(arg)) {
        return {
          error: `Arg[${i}] (${input.name}) expected Buffer, got ${typeof arg}`,
        };
      }
      if (input.type === 'int' && typeof arg !== 'bigint') {
        return {
          error: `Arg[${i}] (${input.name}) expected BigInt, got ${typeof arg}`,
        };
      }
      if (input.type === 'pubkey' && !Buffer.isBuffer(arg)) {
        return {
          error: `Arg[${i}] (${input.name}) expected Buffer, got ${typeof arg}`,
        };
      }
      if (input.type === 'sig' && !Buffer.isBuffer(arg)) {
        return {
          error: `Arg[${i}] (${input.name}) expected Buffer, got ${typeof arg}`,
        };
      }
    });

    // Instantiate contract (without provider - we only need address and bytecode)
    const contract = new Contract(artifact, args);

    return {
      success: true,
      address: contract.address,
      // cashscript >=0.10: 'bytecode' is a hex string (replaces 'lockingBytecode')
      lockingBytecodeHex: contract.bytecode,
    };
  } catch (err: any) {
    return {
      error: err.message,
    };
  }
}

/**
 * Get contract script hash (for use in dependent contracts)
 * @param {Buffer} lockingBytecode - The contract's locking bytecode
 * @returns {string} Script hash as hex string
 */
export async function getContractScriptHash(lockingBytecode: Buffer): Promise<string> {
  const crypto = await import('crypto');
  const hash1 = crypto.createHash('sha256').update(lockingBytecode).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  return hash2.toString('hex');
}

/**
 * Load a contract artifact
 * @param {string} filePath - Path to the artifact JSON file
 * @returns {Object} Parsed artifact or error object
 */
export function loadArtifact(filePath: string): any {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err: any) {
    return {
      error: `Failed to load artifact: ${err.message}`,
    };
  }
}

/**
 * Print contract instantiation result
 * @param {string} contractName - Name of the contract
 * @param {Object} result - Result from instantiateContract
 */
export function printDeploymentResult(contractName: string, result: any): void {
  if (result.error) {
    console.error(`❌ ${contractName} Deployment Failed:`);
    console.error(`   Error: ${result.error}`);
  } else {
    console.log(`✅ ${contractName} Deployed Successfully:`);
    console.log(`   Address: ${result.address}`);
    console.log(`   Locking Bytecode: ${result.lockingBytecodeHex}`);
  }
}

/**
 * Create a deployment record
 * @param {string} contractName - Name of the contract
 * @param {Object} result - Result from instantiateContract
 * @param {string} deploymentTxid - Transaction ID of the funding transaction (optional)
 * @returns {Object} Deployment record
 */
export function createDeploymentRecord(contractName: string, result: any, deploymentTxid: string | null = null): any {
  if (result.error) {
    return {
      name: contractName,
      status: 'failed',
      error: result.error,
      deployedAddress: null,
      deploymentTxid: null,
      deploymentDate: null,
    };
  }

  return {
    name: contractName,
    status: 'deployed',
    deployedAddress: result.address,
    lockingBytecode: result.lockingBytecodeHex,
    deploymentTxid: deploymentTxid,
    deploymentDate: new Date().toISOString(),
  };
}

export default {
  instantiateContract,
  getContractScriptHash,
  loadArtifact,
  printDeploymentResult,
  createDeploymentRecord,
};
