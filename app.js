(() => {
  "use strict";
  const C = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const setText = (id, t) => { const el=$(id); if(el) el.textContent = t; };
  const setStatus = (t) => setText("status", t);

  let provider, signer, user;
  let usdt, core, vault, binary, staking;

  let selectedPkg = 0;           // 1/2/3
  let selectedSideRight = false; // false=Left, true=Right

  let countdownTimer = null;
  let stakeEndSec = 0;
  let stakeClaimed = false;
  let stakePrincipal = "0";

  // -------- Toast / Alerts --------
  function toast(msg, type="ok") {
    const el = $("toast");
    if (!el) return;
    el.classList.remove("show","ok","err");
    el.textContent = msg;
    el.classList.add(type === "err" ? "err" : "ok");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }

  function notifyOk(msg) {
    toast(msg, "ok");
    // สำรองไว้ถ้าผู้ใช้ไม่เห็น toast
    // alert(msg);
  }
  function notifyErr(msg) {
    toast(msg, "err");
    // alert(msg);
  }

  // -------- ABIs --------
  const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
  ];

  const CORE_ABI = [
    "function buyOrUpgrade(uint8 newPkg, address sponsor, bool sideRight)",
    "function users(address) view returns (address sponsor,address parent,bool sideRight,uint8 pkg,uint8 rank,uint32 directSmallOrMore)",
    "function leftChild(address) view returns (address)",
    "function rightChild(address) view returns (address)",
  ];

  const VAULT_ABI = [
    "function claim()",
    "function claimableUSDT(address) view returns (uint256)",
    "function claimableDF(address) view returns (uint256)"
  ];

  const BINARY_ABI = [
    "function volumesOf(address) view returns (uint256 l,uint256 r,uint256 p)"
  ];

  const STAKING_ABI = [
    "function pendingReward(address) view returns (uint256)",
    "function stakes(address) view returns (uint8 pkg,uint256 principal,uint64 start,uint64 end,bool claimed)",
    "function claimStake()"
  ];

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
    const base = location.origin + location.pathname.replace(/index\.html$/i,"");
    setText("leftLink",  `${base}?ref=${user}&side=L`);
    setText("rightLink", `${base}?ref=${user}&side=R`);
  }

  function chooseSide(isRight) {
    selectedSideRight = !!isRight;
    $("btnSideL").classList.toggle("primary", !selectedSideRight);
    $("btnSideR").classList.toggle("primary", selectedSideRight);
  }

  function choosePkg(p) {
    selectedPkg = Number(p);
    const name = selectedPkg === 1 ? "Small (100 USDT)"
               : selectedPkg === 2 ? "Medium (1,000 USDT)"
               : selectedPkg === 3 ? "Large (10,000 USDT)" : "-";
    setText("selectedPkg", name);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.classList.toggle("sel", Number(btn.dataset.pkg) === selectedPkg);
    });
  }

  async function ensureBSC() {
    const net = await provider.getNetwork();
    if (net.chainId === 56) return true;
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: C.CHAIN_ID_HEX }]);
      return true;
    } catch (e) {
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: C.CHAIN_ID_HEX,
          chainName: C.CHAIN_NAME,
          nativeCurrency: { name:"BNB", symbol:"BNB", decimals:18 },
          rpcUrls: [C.RPC_URL],
          blockExplorerUrls: [C.BLOCK_EXPLORER]
        }]);
        return true;
      } catch {
        throw new Error("กรุณาเปลี่ยนเป็น BSC Mainnet ในกระเป๋าก่อน");
      }
    }
  }

  function fmt18(x) {
    try { return ethers.utils.formatUnits(x, 18); } catch { return String(x); }
  }

  const PKG_NAME = ["None","Small","Medium","Large"];
  const RANK_NAME = ["None","Bronze","Silver","Gold"];

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
        setText("stakeStatus", "Matured ✅ (กด Claim Stake ได้)");
        return;
      }

      const days = Math.floor(diff / 86400);
      const hrs = Math.floor((diff % 86400) / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      const secs = diff % 60;

      const hh = String(hrs).padStart(2,"0");
      const mm = String(mins).padStart(2,"0");
      const ss = String(secs).padStart(2,"0");

      setText("stakeCountdown", `${days}d ${hh}:${mm}:${ss}`);
      setText("stakeStatus", "Locked");
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  async function connect() {
    if (!window.ethereum) {
      alert("ไม่พบ Wallet (MetaMask/Bitget). เปิดในกระเป๋าหรือเปิด DApp Browser");
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    user = await signer.getAddress();

    await ensureBSC();

    usdt = new ethers.Contract(C.USDT, ERC20_ABI, signer);
    core = new ethers.Contract(C.CORE, CORE_ABI, signer);
    vault = new ethers.Contract(C.VAULT, VAULT_ABI, signer);
    binary = new ethers.Contract(C.BINARY, BINARY_ABI, signer);
    staking = new ethers.Contract(C.STAKING, STAKING_ABI, signer);

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
  }

  async function refreshAll(showOk=false) {
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

      // ---- stake start/end + countdown ----
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
      notifyErr("Refresh ไม่สำเร็จ");
    }
  }

  async function approveUSDT() {
    if (!user) return alert("กรุณา Connect Wallet ก่อน");
    if (!selectedPkg) return alert("กรุณาเลือกแพ็คเกจก่อน");

    const amt = selectedPkg === 1 ? ethers.utils.parseUnits("100", 18)
              : selectedPkg === 2 ? ethers.utils.parseUnits("1000", 18)
              : ethers.utils.parseUnits("10000", 18);

    try {
      setStatus("Approving USDT...");
      const tx = await usdt.approve(C.CORE, amt);
      await tx.wait();
      setStatus("Approve สำเร็จ ✅");
      notifyOk("Approve USDT สำเร็จ ✅");
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Approve fail: " + msg);
      notifyErr("Approve ไม่สำเร็จ");
    }
  }

  async function buy() {
    if (!user) return alert("กรุณา Connect Wallet ก่อน");
    if (!selectedPkg) return alert("กรุณาเลือกแพ็คเกจก่อน");

    let sponsor = ($("inpSponsor").value || "").trim();
    if (sponsor && !ethers.utils.isAddress(sponsor)) return alert("Sponsor address ไม่ถูกต้อง");
    if (!sponsor) sponsor = ethers.constants.AddressZero;

    try {
      setStatus("Buying / Upgrading...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, selectedSideRight);
      await tx.wait();
      setStatus("Buy/Upgrade สำเร็จ ✅");
      notifyOk("Buy/Upgrade สำเร็จ ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Buy fail: " + msg);
      notifyErr("Buy/Upgrade ไม่สำเร็จ");
    }
  }

  async function claimVault() {
    if (!user) return alert("กรุณา Connect Wallet ก่อน");
    try {
      setStatus("Claiming (Vault)...");
      const tx = await vault.claim();
      await tx.wait();
      setStatus("Claim Vault สำเร็จ ✅");
      notifyOk("Claim Vault สำเร็จ ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Vault fail: " + msg);
      notifyErr("Claim Vault ไม่สำเร็จ");
    }
  }

  async function claimStake() {
    if (!user) return alert("กรุณา Connect Wallet ก่อน");
    try {
      setStatus("Claiming (Staking)...");
      const tx = await staking.claimStake();
      await tx.wait();
      setStatus("Claim Stake สำเร็จ ✅");
      notifyOk("Claim Stake สำเร็จ ✅");
      await refreshAll();
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Stake fail: " + msg);
      notifyErr("Claim Stake ไม่สำเร็จ");
    }
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      notifyOk("คัดลอกลิงก์แล้ว ✅");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      notifyOk("คัดลอกลิงก์แล้ว ✅");
    }
  }

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
      // ให้สะดวก: ถ้าอยากกดทีเดียว
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

    setStatus("Ready. กรุณา Connect Wallet");
  }

  window.addEventListener("load", () => {
    initStatic();
    bindUI();
    parseQuery();
  });
})();
