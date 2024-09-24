const fs = require('fs').promises;

const SELECTED_TOKENS_FILE = 'selected_tokens.json';
const PAIRS_FILE = 'uniswap_v2_pairs.json';
const TAX_RATE = 0.003; // 0.3% fee for Uniswap V2

class Graph {
  constructor() {
    this.nodes = new Set();
    this.edges = {};
  }

  addNode(node) {
    this.nodes.add(node);
    this.edges[node] = {};
  }

  addEdge(from, to, weight) {
    this.edges[from][to] = weight;
  }
}

async function constructTokenGraph() {
  const selectedTokens = JSON.parse(await fs.readFile(SELECTED_TOKENS_FILE, 'utf8'));
  const pairs = JSON.parse(await fs.readFile(PAIRS_FILE, 'utf8'));

  const graph = new Graph();

  // Add nodes
  selectedTokens.forEach(token => graph.addNode(token.id));

  // Add edges and calculate weights
  pairs.forEach(pair => {
    if (graph.nodes.has(pair.token0.id) && graph.nodes.has(pair.token1.id)) {
      const weight0to1 = -Math.log((1 - TAX_RATE) * parseFloat(pair.token1Price));
      const weight1to0 = -Math.log((1 - TAX_RATE) * parseFloat(pair.token0Price));
      graph.addEdge(pair.token0.id, pair.token1.id, weight0to1);
      graph.addEdge(pair.token1.id, pair.token0.id, weight1to0);
    }
  });

  return graph;
}

function constructLineGraph(graph) {
  const lineGraph = new Graph();

  // Add nodes to line graph (edges from original graph)
  for (const from of graph.nodes) {
    for (const to in graph.edges[from]) {
      lineGraph.addNode(`${from}-${to}`);
    }
  }

  // Add edges to line graph
  for (const from of graph.nodes) {
    for (const to in graph.edges[from]) {
      for (const next in graph.edges[to]) {
        if (from !== next) {
          lineGraph.addEdge(`${from}-${to}`, `${to}-${next}`, graph.edges[to][next]);
        }
      }
    }
  }

  return lineGraph;
}

function modifiedMooreBellmanFord(graph, source) {
  const distances = {};
  const predecessors = {};

  // Initialize distances and predecessors
  for (const node of graph.nodes) {
    distances[node] = Infinity;
    predecessors[node] = null;
  }
  distances[source] = 0;

  // Relax edges
  for (let i = 0; i < graph.nodes.size - 1; i++) {
    for (const from of graph.nodes) {
      for (const to in graph.edges[from]) {
        const weight = graph.edges[from][to];
        if (distances[from] + weight < distances[to]) {
          distances[to] = distances[from] + weight;
          predecessors[to] = from;
        }
      }
    }
  }

  // Check for negative cycles
  const arbitrageOpportunities = [];
  for (const from of graph.nodes) {
    for (const to in graph.edges[from]) {
      const weight = graph.edges[from][to];
      if (distances[from] + weight < distances[to]) {
        // Negative cycle detected
        let cycle = [to, from];
        let current = from;
        while (predecessors[current] !== to && !cycle.includes(predecessors[current])) {
          cycle.unshift(predecessors[current]);
          current = predecessors[current];
        }
        cycle.unshift(to);
        arbitrageOpportunities.push(cycle);
      }
    }
  }

  return arbitrageOpportunities;
}

function calculateOutput(reserveIn, reserveOut, amountIn) {
    const amountInWithFee = amountIn * (1 - TAX_RATE);
    return (reserveOut * amountInWithFee) / (reserveIn + amountInWithFee);
}

function calculateArbitrageProfitAndOptimalInput(cycle, tokenGraph, pairs) {
    const startToken = cycle[0].split('-')[0];
    let low = 0;
    let high = 1e20; // A large number as the upper bound
    const EPSILON = 1e-8;

    while (high - low > EPSILON) {
        const mid = (low + high) / 2;
        const [endAmount, _] = simulateArbitrage(cycle, tokenGraph, pairs, mid);
        
        if (endAmount > mid) {
            low = mid;
        } else {
            high = mid;
        }
    }

    const [endAmount, path] = simulateArbitrage(cycle, tokenGraph, pairs, low);
    const profit = endAmount - low;

    return { profit, optimalInput: low, path };
}

function simulateArbitrage(cycle, tokenGraph, pairs, startAmount) {
    let amount = startAmount;
    const path = [];

    for (let i = 0; i < cycle.length - 1; i++) {
        const [fromToken, toToken] = cycle[i].split('-');
        const pair = pairs.find(p => 
            (p.token0.id === fromToken && p.token1.id === toToken) ||
            (p.token1.id === fromToken && p.token0.id === toToken)
        );

        if (!pair) {
            throw new Error(`Pair not found for ${fromToken}-${toToken}`);
        }

        const [reserveIn, reserveOut] = pair.token0.id === fromToken 
            ? [pair.reserve0, pair.reserve1]
            : [pair.reserve1, pair.reserve0];

        amount = calculateOutput(parseFloat(reserveIn), parseFloat(reserveOut), amount);
        path.push({ from: fromToken, to: toToken, amount });
    }

    return [amount, path];
}

async function detectArbitrageOpportunities() {
    const tokenGraph = await constructTokenGraph();
    const lineGraph = constructLineGraph(tokenGraph);
    const pairs = JSON.parse(await fs.readFile(PAIRS_FILE, 'utf8'));

    const arbitrageOpportunities = [];
    for (const source of lineGraph.nodes) {
        const opportunities = modifiedMooreBellmanFord(lineGraph, source);
        for (const opp of opportunities) {
            const { profit, optimalInput, path } = calculateArbitrageProfitAndOptimalInput(opp, tokenGraph, pairs);
            if (profit > 0) {
                arbitrageOpportunities.push({ cycle: opp, profit, optimalInput, path });
            }
        }
    }

    return arbitrageOpportunities;
}

detectArbitrageOpportunities().then(opportunities => {
    console.log(`Detected ${opportunities.length} profitable arbitrage opportunities:`);
    opportunities.sort((a, b) => b.profit - a.profit); // Sort by profit in descending order
    opportunities.slice(0, 10).forEach(opp => {
        console.log(`Cycle: ${opp.cycle.join(' -> ')}`);
        console.log(`Optimal input: ${opp.optimalInput.toFixed(6)}`);
        console.log(`Profit: ${opp.profit.toFixed(6)}`);
        console.log('Path:');
        opp.path.forEach(step => {
            console.log(`  ${step.from} -> ${step.to}: ${step.amount.toFixed(6)}`);
        });
        console.log('---');
    });
}).catch(console.error);