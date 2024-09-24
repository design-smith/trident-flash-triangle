const axios = require('axios');
const fs = require('fs').promises;

const UNISWAP_V2_SUBGRAPH_URL = 'https://gateway.thegraph.com/api/cb3e0da49bcbcc929f0c1a457b2246b3/subgraphs/id/EYCKATKGBKLWvSfwvBjzfCBmGwYNdVkduYXVivCsLRFu';
const OUTPUT_FILE = 'uniswap_v2_pairs.json';

async function fetchUniswapV2Pairs(first = 1000, skip = 0) {
  const query = `
    query {
      pairs(first: ${first}, skip: ${skip}, orderBy: reserveUSD, orderDirection: desc) {
        id
        token0 {
          id
          symbol
          name
        }
        token1 {
          id
          symbol
          name
        }
        reserve0
        reserve1
        reserveUSD
        token0Price
        token1Price
      }
    }
  `;

  try {
    const response = await axios.post(UNISWAP_V2_SUBGRAPH_URL, { query });
    return response.data.data.pairs;
  } catch (error) {
    console.error('Error fetching Uniswap V2 pairs:', error);
    return [];
  }
}

async function getAllUniswapV2Pairs() {
  let allPairs = [];
  let hasMore = true;
  let skip = 0;
  const batchSize = 1000;

  while (hasMore) {
    console.log(`Fetching pairs ${skip} to ${skip + batchSize}...`);
    const pairs = await fetchUniswapV2Pairs(batchSize, skip);
    allPairs = allPairs.concat(pairs);
    skip += batchSize;
    hasMore = pairs.length === batchSize;
  }

  return allPairs;
}

async function main() {
  console.log('Fetching all Uniswap V2 pairs...');
  const pairs = await getAllUniswapV2Pairs();
  console.log(`Retrieved ${pairs.length} pairs.`);

  // Store pairs in a JSON file
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(pairs, null, 2));
  console.log(`Pairs data saved to ${OUTPUT_FILE}`);

  // Example: Print some statistics
  const uniqueTokens = new Set();
  let totalReserveUSD = 0;
  pairs.forEach(pair => {
    uniqueTokens.add(pair.token0.id);
    uniqueTokens.add(pair.token1.id);
    totalReserveUSD += parseFloat(pair.reserveUSD);
  });

  console.log(`Total unique tokens: ${uniqueTokens.size}`);
  console.log(`Total reserve USD: $${totalReserveUSD.toFixed(2)}`);
}

main().catch(console.error);