const fs = require('fs');
const path = require('path');
const solc = require('solc');

const root = path.join(__dirname, '..');
const contractPath = path.join(root, 'contracts', 'AgentWorkEscrow.sol');
const source = fs.readFileSync(contractPath, 'utf8');

function findImports(importPath) {
  const candidates = [];
  if (importPath.startsWith('@openzeppelin/contracts/')) {
    candidates.push(path.join(root, 'lib', 'openzeppelin-contracts', 'contracts', importPath.replace('@openzeppelin/contracts/', '')));
  }
  candidates.push(path.join(root, importPath));
  candidates.push(path.join(root, 'lib', importPath));
  candidates.push(path.join(root, 'node_modules', importPath));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, 'utf8') };
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: 'Solidity',
  sources: {
    'AgentWorkEscrow.sol': { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = output.errors || [];
for (const err of errors) {
  console.log(`${err.severity}: ${err.formattedMessage}`);
}
const fatal = errors.filter((err) => err.severity === 'error');
if (fatal.length) process.exit(1);

const contract = output.contracts['AgentWorkEscrow.sol']['AgentWorkEscrow'];
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'artifacts', 'AgentWorkEscrow.json'),
  JSON.stringify(contract, null, 2)
);
console.log('Compiled AgentWorkEscrow.sol successfully');
