// Generated from chain/abi/IAgentPolicy.json; agentPolicy.test.ts checks they match.
export const agentPolicyAbi = [
  {
    type: "function",
    name: "cancelPending",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "executeSweep",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "freeze",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "freezeEpoch",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "epoch",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCounters",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "paymentsToday",
        type: "uint32",
        internalType: "uint32",
      },
      {
        name: "dayIndex",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "totalCharged",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "totalSwept",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getFeeSpend",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "feeSpentToday",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "dayIndex",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMandate",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.Mandate",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "frozen",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMandateV2",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.MandateV2",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyFeeCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "feeCapSet",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "frozen",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMandateV3",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.MandateV3",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "payeeDailyCaps",
            type: "uint256[]",
            internalType: "uint256[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyFeeCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxPaymentsPerDay",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "frozen",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPayeeSpend",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "payee",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "spentToday",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "dayIndex",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPending",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.MandateV3",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "payeeDailyCaps",
            type: "uint256[]",
            internalType: "uint256[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyFeeCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxPaymentsPerDay",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "mandateEta",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "sweepTo",
        type: "address",
        internalType: "address",
      },
      {
        name: "sweepEta",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSpend",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "spentToday",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "dayIndex",
        type: "uint64",
        internalType: "uint64",
      },
      {
        name: "totalCharged",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "guardian",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "guardianFreeze",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "epoch",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "sig",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isAgent",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "registered",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "loosenDelay",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerKey",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "x",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "y",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownerNonce",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "register",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "ownerX",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "ownerY",
        type: "bytes32",
        internalType: "bytes32",
      },
      {
        name: "agentSig",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ruleVersion",
    inputs: [],
    outputs: [
      {
        name: "version",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "setGuardian",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "guardian",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMandate",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.Mandate",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMandateV2",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.MandateV2",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyFeeCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setMandateV3",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "m",
        type: "tuple",
        internalType: "struct IAgentPolicy.MandateV3",
        components: [
          {
            name: "payees",
            type: "address[]",
            internalType: "address[]",
          },
          {
            name: "payeeDailyCaps",
            type: "uint256[]",
            internalType: "uint256[]",
          },
          {
            name: "perTxCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "dailyFeeCap",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "maxPaymentsPerDay",
            type: "uint32",
            internalType: "uint32",
          },
          {
            name: "expiry",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sweep",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unfreeze",
    inputs: [
      {
        name: "agent",
        type: "address",
        internalType: "address",
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "auth",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "ownerX",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "ownerY",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Frozen",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GuardianSet",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "guardian",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MandateScheduled",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "mandateHash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32",
      },
      {
        name: "eta",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MandateSet",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "perTxCap",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "dailyCap",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
      {
        name: "expiry",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
      {
        name: "payeeCount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PendingCancelled",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SweepScheduled",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "eta",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Swept",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "to",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Unfrozen",
    inputs: [
      {
        name: "agent",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
] as const;
