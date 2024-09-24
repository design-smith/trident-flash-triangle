const fs = require('fs').promises;

const INPUT_FILE = 'uniswap_v2_pairs.json';
const OUTPUT_FILE = 'selected_tokens.json';
const MIN_TVL = 20000; // $20,000 minimum TVL
const TARGET_TOKEN_COUNT = 100;
const TARGET_POOL_COUNT = 400;

async function processUniswapV2Data() {
  // Read the stored Uniswap V2 pairs data
  const pairsData = JSON.parse(await fs.readFile(INPUT_FILE, 'utf8'));

  // Filter and sort pools
  const filteredPools = pairsData
    .filter(pair => parseFloat(pair.reserveUSD) >= MIN_TVL)
    .sort((a, b) => parseFloat(b.reserveUSD) - parseFloat(a.reserveUSD));

  // Select top ~400 pools
  let selectedPools = filteredPools.slice(0, TARGET_POOL_COUNT);

  // Extract unique tokens
  let uniqueTokens = new Set();
  selectedPools.forEach(pool => {
    uniqueTokens.add(pool.token0.id);
    uniqueTokens.add(pool.token1.id);
  });

  // Iteratively remove lower TVL pools if we have more than 100 tokens
  while (uniqueTokens.size > TARGET_TOKEN_COUNT && selectedPools.length > 0) {
    selectedPools.pop(); // Remove the lowest TVL pool
    uniqueTokens = new Set();
    selectedPools.forEach(pool => {
      uniqueTokens.add(pool.token0.id);
      uniqueTokens.add(pool.token1.id);
    });
  }

  // Create the final set of selected tokens with additional info
  const selectedTokens = Array.from(uniqueTokens).map(tokenId => {
    const token = selectedPools.find(pool => pool.token0.id === tokenId || pool.token1.id === tokenId);
    return token.token0.id === tokenId ? token.token0 : token.token1;
  });

  // Save the selected tokens to a file
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(selectedTokens, null, 2));

  console.log(`Selected ${selectedTokens.length} tokens from ${selectedPools.length} pools.`);
  console.log(`Token data saved to ${OUTPUT_FILE}`);

  return { selectedTokens, selectedPools };
}

processUniswapV2Data().catch(console.error);