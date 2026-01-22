// app.js (ethers v5) - CoreV4 / VaultV4 / BinaryV4 / StakingV4
;(() => {
  "use strict";
  const C = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setStatus = (t) => setText("status", t);

  let provider, signer, user;
  let usdt, core, vault, binary, staking;

  let selectedPkg = null;        // 1/2/3 (Small/Medium/Large)
  let selectedSideRight = false; // false=Left, true=Right

  let countdownTimer = null;
  let stakeEndSec = 0;
  let stakeClaimed = false;
  let stakePrincipal = "0";

  // -------- Toast --------
  function toast(msg, type = "ok") {
    const el = $("toast");
    if (!el) return;
    el.classList.remove("show", "ok", "err");
    el.textContent = msg;
    el.classList.add(type === "err" ? "err" : "ok");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }
  const notifyOk = (m) => toast(m, "ok");
  const notifyErr = (m) => toast(m, "err");

  // -------- Helpers --------
  function parseQuery() {
    const q = new URLSearchParams(location.search);
    const ref = q.get("ref");
    const side = (q.get("side") || "").toUpperCase();
    if (ref && ethers.utils.isAddress(ref)) $("inpSponsor").value = ref;
    if (side === "R") chooseSide(true);
    if (side === "L") chooseSide(false);
  }

  function buildLinks() {
    if (!user) return;
    const base = location.origin + location.pathname.replace(/index\.html$/i, "");
    setText("leftLink",  `${base}?ref=${user}&side=L`);
    setText("rightLink", `${base}?ref=${user}&side=R`);
  }

  function chooseSide(isRight) {
    selectedSideRight = !!isRight;
    $("btnSideL")?.classList.toggle("primary", !selectedSideRight);
    $("btnSideR")?.classList.toggle("primary", selectedSideRight);
  }

  function choosePkg(p) {
    selectedPkg = Number(p);
    const name = selectedPkg === 1 ? "Small (100 USDT)"
      : selectedPkg === 2 ? "Medium (1,000 USDT)"
      : selectedPkg === 3 ? "Large (10,000 USDT)"
      : "-";
    setText("selectedPkg", name);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.classList.toggle("sel", Number(btn.dataset.pkg) === selectedPkg);
    });
  }

  async function ensureBSC() {
    const net = await provider.getNetwork();
    if (net.chainId === C.CHAIN_ID_DEC) return true;

    // try switch
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: C.CHAIN_ID_HEX }]);
      return true;
    } catch (e) {
      // try add
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: C.CHAIN_ID_HEX,
          chainName: C.CHAIN_NAME,
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [C.RPC_URL],
          blockExplorerUrls: [C.BLOCK_EXPLORER]
        }]);
        return true;
      } catch {
        throw new Error("Please switch to BSC Mainnet in your wallet.");
      }
    }
  }

  function fmt18(x) {
    try { return ethers.utils.formatUnits(x, 18); } catch { return String(x); }
  }

  const PKG_NAME = ["None", "Small", "Medium", "Large"];
  const RANK_NAME = ["None", "Bronze", "Silver", "Gold"];

  function fmtTS(sec) {
    if (!sec || sec === 0) return "-";
    const d = new Date(Number(sec) * 1000);
    return d.toLocaleString();
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function startCountdown() {
    stopCountdown();
    const tick = () => {
      if (!stakeEndSec || stakeEndSec === 0) {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "-");
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const diff = stakeEndSec - now;

      if (stakeClaimed) {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "Claimed ✅");
        return;
      }

      if (stakePrincipal === "0") {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "No stake");
        return;
      }

      if (diff <= 0) {
        setText("stakeCountdown", "00:00:00");
        setText("stakeStatus", "Matured ✅ (Claim Stake available)");
        return;
      }

      const days = Math.floor(diff / 86400);
      const hrs = Math.floor((diff % 86400) / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      const secs = diff % 60;

      setText("stakeCountdown", `${days}d ${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      setText("stakeStatus", "Locked");
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  // -------- Connect --------
  async function connect() {
    try {
      if (!window.ethereum) {
        alert("Wallet not found. Open in MetaMask/Bitget DApp browser.");
        return;
      }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      await ensureBSC();

      // ✅ Use ABIs from config only (no duplicates)
      usdt    = new ethers.Contract(C.USDT,    C.ERC20_ABI, signer);
      core    = new ethers.Contract(C.CORE,    C.CORE_ABI, signer);
      vault   = new ethers.Contract(C.VAULT,   C.VAULT_ABI, signer);
      binary  = new ethers.Contract(C.BINARY,  C.BINARY_ABI, signer);
      staking = new ethers.Contract(C.STAKING, C.STAKING_ABI, signer);

      setText("walletAddr", user);
      setText("netText", "BSC (56)");
      setText("coreAddr", C.CORE);
      setText("vaultAddr", C.VAULT);
      setText("binaryAddr", C.BINARY);
      setText("stakingAddr", C.STAKING);
      setText("usdtAddr", C.USDT);
      setText("dfAddr", C.DF);

      $("btnConnect").textContent = "Connected";
      $("btnConnect").disabled = true;

      buildLinks();
      await refreshAll(true);

      window.ethereum.on?.("accountsChanged", () => location.reload());
      window.ethereum.on?.("chainChanged", () => location.reload());
    } catch (e) {
      console.error(e);
      setStatus("Connect error: " + (e?.message || e));
      notifyErr("Connect failed");
    }
  }

  // -------- Refresh --------
  async function refreshAll(showOk = false) {
    if (!user) return;

    try {
      setStatus("Refreshing...");

      const u = await core.users(user);
      const sponsor = u.sponsor;
      const sideRight = u.sideRight;
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);

      setText("mySponsor", sponsor === ethers.constants.AddressZero ? "-" : sponsor);
      setText("mySide", pkg === 0 ? "-" : (sideRight ? "Right" : "Left"));
      setText("myPkg", PKG_NAME[pkg] || "-");
      setText("myRank", RANK_NAME[rank] || "-");

      const l = await core.leftChild(user);
      const r = await core.rightChild(user);
      setText("leftChild", l === ethers.constants.AddressZero ? "-" : l);
      setText("rightChild", r === ethers.constants.AddressZero ? "-" : r);

      const cu = await vault.claimableUSDT(user);
      const cd = await vault.claimableDF(user);
      setText("claimUSDT", fmt18(cu));
      setText("claimDF", fmt18(cd));

      const vols = await binary.volumesOf(user);
      setText("volL", fmt18(vols.l));
      setText("volR", fmt18(vols.r));
      setText("volP", fmt18(vols.p));

      const pending = await staking.pendingReward(user);
      setText("pendingStake", fmt18(pending));

      const s = await staking.stakes(user);
      const start = Number(s.start);
      const end = Number(s.end);
      stakeClaimed = !!s.claimed;
      stakeEndSec = end || 0;
      stakePrincipal = (s.principal ? s.principal.toString() : "0");

      setText("stakeStart", fmtTS(start));
      setText("stakeEnd", fmtTS(end));
      startCountdown();

      setStatus(showOk ? "Refreshed ✅" : "Updated ✅");
    } catch (e) {
      console.error(e);
      setStatus("Refresh error: " + (e?.message || e));
      notifyErr("Refresh failed");
    }
  }

  // -------- Actions --------
  async function approveUSDT() {
    if (!user) return alert("Please connect wallet first");
    if (!selectedPkg) return alert("Please select a package first");

    const amt = selectedPkg === 1 ? ethers.utils.parseUnits("100", 18)
      : selectedPkg === 2 ? ethers.utils.parseUnits("1000", 18)
      : ethers.utils.parseUnits("10000", 18);

    try {
      setStatus("Approving USDT...");
      const tx = await usdt.approve(C.CORE, amt);
      await tx.wait();
      setStatus("Approve success ✅");
      notifyOk("Approve USDT success ✅");
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Approve fail: " + msg);
      notifyErr("Approve failed");
    }
  }

  async function buy() {
    if (!user) return alert("Please connect wallet first");
    if (!selectedPkg) return alert("Please select a package first");

    let sponsor = ($("inpSponsor").value || "").trim();
    if (sponsor && !ethers.utils.isAddress(sponsor)) return alert("Invalid sponsor address");
    if (!sponsor) sponsor = ethers.constants.AddressZero; // ✅ CoreV4 will fallback to company wallet

    try {
      setStatus("Buying / Upgrading...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, selectedSideRight);
      await tx.wait();
      setStatus("Buy/Upgrade success ✅");
      notifyOk("Buy/Upgrade success ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Buy fail: " + msg);
      notifyErr("Buy/Upgrade failed");
    }
  }

  async function claimVault() {
    if (!user) return alert("Please connect wallet first");
    try {
      setStatus("Claiming (Vault)...");
      const tx = await vault.claim();
      await tx.wait();
      setStatus("Claim Vault success ✅");
      notifyOk("Claim Vault success ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Vault fail: " + msg);
      notifyErr("Claim Vault failed");
    }
  }

  async function claimStake() {
    if (!user) return alert("Please connect wallet first");
    try {
      setStatus("Claiming (Staking)...");
      const tx = await staking.claimStake();
      await tx.wait();
      setStatus("Claim Stake success ✅");
      notifyOk("Claim Stake success ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Stake fail: " + msg);
      notifyErr("Claim Stake failed");
    }
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      notifyOk("Copied ✅");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      notifyOk("Copied ✅");
    }
  }

  // -------- Bind UI --------
  function bindUI() {
    $("btnConnect").onclick = connect;
    $("btnRefresh").onclick = () => refreshAll(true);

    $("btnSideL").onclick = () => chooseSide(false);
    $("btnSideR").onclick = () => chooseSide(true);
    chooseSide(false);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.onclick = () => choosePkg(btn.dataset.pkg);
    });

    $("btnApprove").onclick = approveUSDT;
    $("btnBuy").onclick = async () => {
      await approveUSDT();
      await buy();
    };

    $("btnClaimVault").onclick = claimVault;
    $("btnClaimStake").onclick = claimStake;

    $("btnCopyLeft").onclick = async () => {
      const t = $("leftLink").textContent;
      if (t && t !== "-") await copyText(t);
    };
    $("btnCopyRight").onclick = async () => {
      const t = $("rightLink").textContent;
      if (t && t !== "-") await copyText(t);
    };
  }

  function initStatic() {
    setText("coreAddr", C.CORE);
    setText("vaultAddr", C.VAULT);
    setText("binaryAddr", C.BINARY);
    setText("stakingAddr", C.STAKING);
    setText("usdtAddr", C.USDT);
    setText("dfAddr", C.DF);

    setText("stakeStart", "-");
    setText("stakeEnd", "-");
    setText("stakeCountdown", "-");
    setText("stakeStatus", "-");

    setStatus("Ready. Please connect wallet.");
  }

  window.addEventListener("load", () => {
    initStatic();
    bindUI();
    parseQuery();
  });
})();
