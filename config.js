// config.js
window.APP_CONFIG = {
  CHAIN_ID_DEC: 56,
  CHAIN_ID_HEX: "0x38",
  CHAIN_NAME: "BSC Mainnet",
  BLOCK_EXPLORER: "https://bscscan.com",

  // ===== Token addresses =====
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  DF:   "0x36579d7eC4b29e875E3eC21A55F71C822E03A992",

  // ===== Contract addresses =====
  CORE:   "0xcE4FFd6AfD8C10c533AEc7455E2e83750b8D1659",
  VAULT:  "0xF394c73Af94f39f660041802915f3421DE8f1a46",
  BINARY: "0xD78043E993D0F6cC95F5f81eE927883BbFc41Ac6",
  STAKING:"0x4Dfa9EFEAc6069D139CF7ffEe406FAB78d7410A7",

  // ===== ERC20 ABI (USDT / DF) =====
  ERC20_ABI: [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ],

  // ===== CoreV4 ABI =====
  CORE_ABI: [
    "function buyOrUpgrade(uint8 pkg, address sponsor, bool sideRight)",
    "function users(address) view returns (address sponsor,address parent,bool sideRight,uint8 pkg,uint8 rank,uint32 directSmallOrMore)",
    "function sponsorOf(address) view returns (address)",
    "function rankOf(address) view returns (uint8)",
    "function leftChild(address) view returns (address)",
    "function rightChild(address) view returns (address)"
  ],

  // ===== VaultV4 ABI =====
  VAULT_ABI: [
    "function claim()",
    "function claimableUSDT(address) view returns (uint256)",
    "function claimableDF(address) view returns (uint256)"
  ],

  // ===== BinaryV4 ABI =====
  BINARY_ABI: [
    "function volumesOf(address) view returns (uint256 l,uint256 r,uint256 p)"
  ],

  // ===== Staking365V4 ABI =====
  STAKING_ABI: [
    "function pendingReward(address) view returns (uint256)",
    "function stakes(address) view returns (uint8 pkg,uint256 principal,uint64 start,uint64 end,bool claimed)",
    "function claimStake()"
  ]
};
