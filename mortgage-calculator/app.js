const baseline = {
  propertyLocation: "england-ni",
  buyerStatus: "main-home",
  housePrice: 650000,
  deposit: 130000,
  mortgageTerm: 25,
  interestRate: 4.5,
  houseAppreciation: 3.5,
  projectionPeriod: 20,
  taxResidence: "ruk",
  incomeOne: 85000,
  incomeTwo: 65000,
  cashSavings: 150000,
  etfPortfolio: 500000,
  investmentReturn: 7.0,
  leanLivingCosts: 3000,
  livingCosts: 4200,
  comfortableLivingCosts: 5400,
  maintenanceRate: 1.0,
  desiredLiquidReserve: 75000,
};

const inputConfig = {
  propertyLocation: { element: document.getElementById("property-location"), type: "select" },
  buyerStatus: { element: document.getElementById("buyer-status"), type: "select" },
  housePrice: { element: document.getElementById("house-price"), type: "number", display: document.getElementById("house-price-value"), format: pounds },
  deposit: { element: document.getElementById("deposit"), type: "number", display: document.getElementById("deposit-value"), format: pounds },
  mortgageTerm: { element: document.getElementById("mortgage-term"), type: "number", display: document.getElementById("mortgage-term-value"), format: years },
  interestRate: { element: document.getElementById("interest-rate"), type: "number", display: document.getElementById("interest-rate-value"), format: percent },
  houseAppreciation: { element: document.getElementById("house-appreciation"), type: "number", display: document.getElementById("house-appreciation-value"), format: percent },
  projectionPeriod: { element: document.getElementById("projection-period"), type: "number", display: document.getElementById("projection-period-value"), format: years },
  taxResidence: { element: document.getElementById("tax-residence"), type: "select" },
  incomeOne: { element: document.getElementById("income-one"), type: "number", display: document.getElementById("income-one-value"), format: pounds },
  incomeTwo: { element: document.getElementById("income-two"), type: "number", display: document.getElementById("income-two-value"), format: pounds },
  cashSavings: { element: document.getElementById("cash-savings"), type: "number", display: document.getElementById("cash-savings-value"), format: pounds },
  etfPortfolio: { element: document.getElementById("etf-portfolio"), type: "number", display: document.getElementById("etf-portfolio-value"), format: pounds },
  investmentReturn: { element: document.getElementById("investment-return"), type: "number", display: document.getElementById("investment-return-value"), format: percent },
  leanLivingCosts: { element: document.getElementById("lean-living-costs"), type: "number", display: document.getElementById("lean-living-costs-value"), format: pounds },
  livingCosts: { element: document.getElementById("living-costs"), type: "number", display: document.getElementById("living-costs-value"), format: pounds },
  comfortableLivingCosts: { element: document.getElementById("comfortable-living-costs"), type: "number", display: document.getElementById("comfortable-living-costs-value"), format: pounds },
  maintenanceRate: { element: document.getElementById("maintenance-rate"), type: "number", display: document.getElementById("maintenance-rate-value"), format: percent },
  desiredLiquidReserve: { element: document.getElementById("desired-liquid-reserve"), type: "number", display: document.getElementById("desired-liquid-reserve-value"), format: pounds },
};

const STORAGE_KEY = "mortgage-budget-tool:inputs:v3";
const canPersistInputs = storageAvailable();

class Earner {
  constructor(grossIncome, taxResidence) {
    this.grossIncome = grossIncome;
    this.taxResidence = taxResidence;
  }

  personalAllowance() {
    const taper = Math.max(0, this.grossIncome - 100000) / 2;
    return Math.max(0, 12570 - taper);
  }

  taxableIncome() {
    return Math.max(0, this.grossIncome - this.personalAllowance());
  }

  incomeTax() {
    const taxable = this.taxableIncome();
    if (this.taxResidence === "scotland") {
      return applyBandWidths(taxable, [
        { width: 2827, rate: 0.19 },
        { width: 12094, rate: 0.2 },
        { width: 16171, rate: 0.21 },
        { width: 31338, rate: 0.42 },
        { width: 50140, rate: 0.45 },
        { width: Infinity, rate: 0.48 },
      ]);
    }

    return applyBandWidths(taxable, [
      { width: 37700, rate: 0.2 },
      { width: 74870, rate: 0.4 },
      { width: Infinity, rate: 0.45 },
    ]);
  }

  nationalInsurance() {
    const primaryThreshold = 12570;
    const upperEarningsLimit = 50270;
    const mainBand = Math.max(0, Math.min(this.grossIncome, upperEarningsLimit) - primaryThreshold);
    const upperBand = Math.max(0, this.grossIncome - upperEarningsLimit);
    return mainBand * 0.08 + upperBand * 0.02;
  }

  takeHome() {
    return this.grossIncome - this.incomeTax() - this.nationalInsurance();
  }

  marginalTakeHomePerPound() {
    const current = this.takeHome();
    const next = new Earner(this.grossIncome + 1, this.taxResidence).takeHome();
    return Math.max(0, next - current);
  }
}

class Mortgage {
  constructor(principal, annualRate, termYears) {
    this.principal = principal;
    this.annualRate = annualRate / 100;
    this.termYears = termYears;
  }

  monthlyRate() {
    return this.annualRate / 12;
  }

  totalMonths() {
    return this.termYears * 12;
  }

  monthlyPayment() {
    if (this.principal <= 0) {
      return 0;
    }

    const rate = this.monthlyRate();
    const months = this.totalMonths();

    if (rate === 0) {
      return this.principal / months;
    }

    return (this.principal * rate) / (1 - Math.pow(1 + rate, -months));
  }

  projection(years) {
    const monthlyPayment = this.monthlyPayment();
    const monthlyRate = this.monthlyRate();
    const totalProjectionMonths = years * 12;
    const totalMortgageMonths = this.totalMonths();
    const snapshots = [{ year: 0, balance: this.principal, cumulativeInterest: 0 }];
    let balance = this.principal;
    let cumulativeInterest = 0;

    for (let month = 1; month <= totalProjectionMonths; month += 1) {
      if (balance <= 0 || month > totalMortgageMonths) {
        balance = 0;
      } else {
        const interest = balance * monthlyRate;
        const principalPaid = Math.min(balance, monthlyPayment - interest);
        balance = Math.max(0, balance - principalPaid);
        cumulativeInterest += interest;
      }

      if (month % 12 === 0) {
        snapshots.push({
          year: month / 12,
          balance,
          cumulativeInterest,
        });
      }
    }

    return {
      monthlyPayment,
      snapshots,
      finalBalance: snapshots[snapshots.length - 1].balance,
      interestPaid: snapshots[snapshots.length - 1].cumulativeInterest,
    };
  }
}

class PropertyPurchase {
  constructor(price, deposit, propertyLocation, buyerStatus) {
    this.price = price;
    this.deposit = deposit;
    this.propertyLocation = propertyLocation;
    this.buyerStatus = buyerStatus;
  }

  loanAmount() {
    return Math.max(0, this.price - this.deposit);
  }

  purchaseTax() {
    if (this.propertyLocation === "england-ni") {
      return this.sdlt();
    }

    if (this.propertyLocation === "scotland") {
      return this.lbtt();
    }

    return this.ltt();
  }

  purchaseTaxLabel() {
    if (this.propertyLocation === "england-ni") {
      return "SDLT";
    }

    if (this.propertyLocation === "scotland") {
      return "LBTT";
    }

    return "LTT";
  }

  buyerStatusNote() {
    if (this.propertyLocation === "wales" && this.buyerStatus === "first-time") {
      return "Wales does not currently offer first-time buyer relief, so main residential LTT rates are used.";
    }

    if (this.propertyLocation === "england-ni" && this.buyerStatus === "first-time" && this.price > 500000) {
      return "England / Northern Ireland first-time buyer relief only applies up to £500,000, so standard SDLT rates are used here.";
    }

    return "";
  }

  sdlt() {
    const standard = steppedTax(this.price, [
      { upTo: 125000, rate: 0 },
      { upTo: 250000, rate: 0.02 },
      { upTo: 925000, rate: 0.05 },
      { upTo: 1500000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ]);

    if (this.buyerStatus === "first-time" && this.price <= 500000) {
      return steppedTax(this.price, [
        { upTo: 300000, rate: 0 },
        { upTo: 500000, rate: 0.05 },
        { upTo: Infinity, rate: 0.12 },
      ]);
    }

    if (this.buyerStatus === "additional-home") {
      return standard + this.price * 0.05;
    }

    return standard;
  }

  lbtt() {
    const standard = steppedTax(this.price, [
      { upTo: 145000, rate: 0 },
      { upTo: 250000, rate: 0.02 },
      { upTo: 325000, rate: 0.05 },
      { upTo: 750000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ]);

    if (this.buyerStatus === "first-time") {
      return steppedTax(this.price, [
        { upTo: 175000, rate: 0 },
        { upTo: 250000, rate: 0.02 },
        { upTo: 325000, rate: 0.05 },
        { upTo: 750000, rate: 0.1 },
        { upTo: Infinity, rate: 0.12 },
      ]);
    }

    if (this.buyerStatus === "additional-home") {
      return standard + this.price * 0.08;
    }

    return standard;
  }

  ltt() {
    if (this.buyerStatus === "additional-home") {
      return steppedTax(this.price, [
        { upTo: 180000, rate: 0.05 },
        { upTo: 250000, rate: 0.085 },
        { upTo: 400000, rate: 0.1 },
        { upTo: 750000, rate: 0.125 },
        { upTo: 1500000, rate: 0.15 },
        { upTo: Infinity, rate: 0.17 },
      ]);
    }

    return steppedTax(this.price, [
      { upTo: 225000, rate: 0 },
      { upTo: 400000, rate: 0.06 },
      { upTo: 750000, rate: 0.075 },
      { upTo: 1500000, rate: 0.1 },
      { upTo: Infinity, rate: 0.12 },
    ]);
  }
}

class WealthProjection {
  constructor({
    propertyPurchase,
    mortgage,
    horizonYears,
    investmentReturn,
    houseAppreciation,
    cashSavings,
    etfPortfolio,
  }) {
    this.propertyPurchase = propertyPurchase;
    this.mortgage = mortgage;
    this.horizonYears = horizonYears;
    this.investmentReturn = investmentReturn / 100;
    this.houseAppreciation = houseAppreciation / 100;
    this.cashSavings = cashSavings;
    this.etfPortfolio = etfPortfolio;
  }

  funding() {
    const upfront = this.propertyPurchase.deposit + this.propertyPurchase.purchaseTax();
    const cashUsed = Math.min(this.cashSavings, upfront);
    const etfNeeded = Math.max(0, upfront - this.cashSavings);
    const etfDrawdown = Math.min(this.etfPortfolio, etfNeeded);
    const fundingGap = Math.max(0, upfront - this.cashSavings - this.etfPortfolio);

    return {
      upfront,
      cashUsed,
      etfDrawdown,
      fundingGap,
      cashRemaining: Math.max(0, this.cashSavings - cashUsed),
      etfRemaining: Math.max(0, this.etfPortfolio - etfDrawdown),
    };
  }

  annualSeries() {
    const funding = this.funding();
    const mortgageProjection = this.mortgage.projection(this.horizonYears);

    return mortgageProjection.snapshots.map((snapshot) => {
      const year = snapshot.year;
      const homeValue = this.propertyPurchase.price * Math.pow(1 + this.houseAppreciation, year);
      const etfValue = funding.etfRemaining * Math.pow(1 + this.investmentReturn, year);
      const homeEquity = Math.max(0, homeValue - snapshot.balance);
      const totalNetWorth = homeEquity + etfValue + funding.cashRemaining - funding.fundingGap;

      return {
        year,
        homeValue,
        homeEquity,
        etfValue,
        cashValue: funding.cashRemaining,
        balance: snapshot.balance,
        cumulativeInterest: snapshot.cumulativeInterest,
        totalNetWorth,
      };
    });
  }
}

document.getElementById("reset-button").addEventListener("click", () => {
  clearPersistedInputs();
  applyInputs(baseline);
  syncDepositMax();
  render();
});

Object.entries(inputConfig).forEach(([key, config]) => {
  const eventName = config.type === "select" ? "change" : "input";
  config.element.addEventListener(eventName, () => {
    if (key === "housePrice") {
      syncDepositMax();
    }
    render();
  });
});

applyInputs(readPersistedInputs());
syncDepositMax();
render();

function render() {
  syncDepositMax();
  const state = readInputs();
  syncDisplays(state);
  persistInputs(state);

  // Update slider fill positions
  document.querySelectorAll('input[type="range"]').forEach(el => {
    const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--fill', `${pct}%`);
  });

  const me = new Earner(state.incomeOne, state.taxResidence);
  const partner = new Earner(state.incomeTwo, state.taxResidence);
  const takeHomeYearly = me.takeHome() + partner.takeHome();
  const takeHomeMonthly = takeHomeYearly / 12;
  const current = buildPurchaseOutcome({ state });
  const note = current.home.buyerStatusNote();
  const scenarios = buildScenarioBudgets({
    state,
    takeHomeMonthly,
    monthlyMortgage: current.monthlyMortgage,
    monthlyMaintenance: current.monthlyMaintenance,
  });
  const reservePlan = buildReservePlan({ state, current });
  const resilience = buildResilienceMetrics({
    state,
    current,
    takeHomeMonthly,
    scenarios,
  });
  const verdict = assessDecision({
    current,
    reservePlan,
    scenarios,
    resilience,
  });
  const tradeoffs = buildTradeoffs({
    state,
    current,
  });

  updateDecisionCard({
    state,
    current,
    takeHomeMonthly,
    scenarios,
    reservePlan,
    resilience,
    verdict,
  });
  updateScenarioCard({
    current,
    takeHomeMonthly,
    scenarios,
    resilience,
  });
  updateResilienceCard({
    current,
    reservePlan,
    resilience,
  });
  updateReserveCard({
    current,
    reservePlan,
  });
  updateTradeoffCard({ tradeoffs });
  updateIncomeCard({ me, partner });
  updateDecisionSummary({
    verdict,
    current,
    scenarios,
    reservePlan,
    resilience,
    tradeoffs,
  });
  updateStatusBanner({
    current,
    reservePlan,
    note,
    me,
    partner,
    state,
  });
  updateStressCard({
    scenarios,
    resilience,
  });
  updateChart(current.annualSeries);
  updateSnapshots(current.annualSeries);
  updateFootnote(state, current.home.purchaseTaxLabel());
}

function buildPurchaseOutcome({
  state,
  housePrice = state.housePrice,
  deposit = state.deposit,
  interestRate = state.interestRate,
}) {
  const cappedDeposit = clamp(deposit, 0, housePrice);
  const home = new PropertyPurchase(
    housePrice,
    cappedDeposit,
    state.propertyLocation,
    state.buyerStatus,
  );
  const mortgage = new Mortgage(home.loanAmount(), interestRate, state.mortgageTerm);
  const projection = new WealthProjection({
    propertyPurchase: home,
    mortgage,
    horizonYears: state.projectionPeriod,
    investmentReturn: state.investmentReturn,
    houseAppreciation: state.houseAppreciation,
    cashSavings: state.cashSavings,
    etfPortfolio: state.etfPortfolio,
  });
  const funding = projection.funding();
  const mortgageProjection = mortgage.projection(state.projectionPeriod);
  const annualSeries = projection.annualSeries();
  const finalYear = annualSeries[annualSeries.length - 1];
  const purchaseTax = home.purchaseTax();
  const monthlyMortgage = mortgageProjection.monthlyPayment;
  const monthlyMaintenance = monthlyMaintenanceFor(housePrice, state.maintenanceRate);
  const liquidAfterPurchase = funding.cashRemaining + funding.etfRemaining;

  return {
    home,
    mortgage,
    projection,
    funding,
    mortgageProjection,
    annualSeries,
    finalYear,
    purchaseTax,
    monthlyMortgage,
    monthlyMaintenance,
    liquidAfterPurchase,
  };
}

function buildScenarioBudgets({
  state,
  takeHomeMonthly,
  monthlyMortgage,
  monthlyMaintenance,
}) {
  const fixedHousing = monthlyMortgage + monthlyMaintenance;
  const rows = [
    { key: "normal", label: "Normal life", livingCosts: state.livingCosts },
    { key: "lean", label: "Lean mode", livingCosts: state.leanLivingCosts },
    { key: "comfortable", label: "Comfortable mode", livingCosts: state.comfortableLivingCosts },
  ].map((row) => {
    const totalBurn = fixedHousing + row.livingCosts;
    const slack = takeHomeMonthly - totalBurn;
    return {
      ...row,
      totalBurn,
      slack,
      tone: scenarioTone(slack),
    };
  });

  return {
    fixedHousing,
    normal: rows.find((row) => row.key === "normal"),
    lean: rows.find((row) => row.key === "lean"),
    comfortable: rows.find((row) => row.key === "comfortable"),
    rows,
  };
}

function buildReservePlan({ state, current }) {
  const totalLiquidAssets = state.cashSavings + state.etfPortfolio;
  const reserveTarget = state.desiredLiquidReserve;
  const liquidAfterPurchase = current.liquidAfterPurchase;
  const deployableCapital = Math.max(0, totalLiquidAssets - reserveTarget);
  const reserveGap = liquidAfterPurchase - reserveTarget;
  const remainingAboveReserve = Math.max(0, liquidAfterPurchase - reserveTarget);
  const reserveShortfall = Math.max(0, reserveTarget - liquidAfterPurchase);
  const reserveCovered = Math.min(reserveTarget, liquidAfterPurchase);
  const stackTotal = Math.max(
    totalLiquidAssets,
    reserveTarget + current.home.deposit + current.purchaseTax,
  );

  return {
    totalLiquidAssets,
    reserveTarget,
    deployableCapital,
    liquidAfterPurchase,
    reserveGap,
    remainingAboveReserve,
    reserveShortfall,
    reserveCovered,
    stackTotal,
    reserveShare: percentageOf(reserveCovered, stackTotal),
    depositShare: percentageOf(current.home.deposit, stackTotal),
    taxShare: percentageOf(current.purchaseTax, stackTotal),
    remainingShare: percentageOf(remainingAboveReserve, stackTotal),
    gapShare: percentageOf(reserveShortfall, stackTotal),
    depositLockRatio: totalLiquidAssets === 0 ? 0 : current.home.deposit / totalLiquidAssets,
    upfrontShare: totalLiquidAssets === 0 ? 0 : current.funding.upfront / totalLiquidAssets,
  };
}

function buildResilienceMetrics({
  state,
  current,
  takeHomeMonthly,
  scenarios,
}) {
  const stressedMortgage = new Mortgage(
    current.home.loanAmount(),
    state.interestRate + 1,
    state.mortgageTerm,
  ).monthlyPayment();
  const stressedLeanBurn = stressedMortgage + current.monthlyMaintenance + state.leanLivingCosts;
  const stressedLeanSlack = takeHomeMonthly - stressedLeanBurn;
  const remainingSingleIncome = Math.max(state.incomeOne, state.incomeTwo);
  const singleIncomeLeanSlack = monthlyTakeHomeForGross(
    state.taxResidence,
    remainingSingleIncome,
    0,
  ) - scenarios.lean.totalBurn;

  return {
    stressedLeanSlack,
    singleIncomeLeanSlack,
    runwayNormal: runwayMonths(current.funding.cashRemaining, scenarios.normal.totalBurn),
    runwayLean: runwayMonths(state.desiredLiquidReserve, scenarios.lean.totalBurn),
    runwayStress: runwayMonths(state.desiredLiquidReserve, stressedLeanBurn),
    stressedLeanBurn,
  };
}

function assessDecision({
  current,
  reservePlan,
  scenarios,
  resilience,
}) {
  if (current.funding.fundingGap > 0) {
    return {
      label: "Too far",
      tone: "risk",
      headline: "Not currently fundable",
      detail: `Upfront funding is short by ${pounds(current.funding.fundingGap)} before even protecting reserves.`,
    };
  }

  let score = 0;
  const concerns = [];

  if (scenarios.normal.slack >= 1500) {
    score += 2;
  } else if (scenarios.normal.slack >= 500) {
    score += 1;
  } else if (scenarios.normal.slack < 0) {
    score -= 2;
    concerns.push(`Normal life runs ${signedPounds(scenarios.normal.slack)} per month.`);
  }

  if (scenarios.lean.slack >= 3000) {
    score += 2;
  } else if (scenarios.lean.slack >= 1500) {
    score += 1;
  } else if (scenarios.lean.slack < 500) {
    score -= 1;
    concerns.push(`Lean mode only leaves ${signedPounds(scenarios.lean.slack)}.`);
  }

  if (resilience.stressedLeanSlack >= 750) {
    score += 1;
  } else if (resilience.stressedLeanSlack < 0) {
    score -= 1;
    concerns.push(`Lean mode turns negative if rates reset 1 point higher.`);
  }

  if (reservePlan.reserveGap >= 0) {
    score += 2;
  } else if (reservePlan.reserveGap >= -25000) {
    concerns.push(`You would eat into reserve targets by ${pounds(Math.abs(reservePlan.reserveGap))}.`);
  } else {
    score -= 2;
    concerns.push(`Reserves fall short by ${pounds(Math.abs(reservePlan.reserveGap))} after purchase.`);
  }

  if (resilience.runwayLean >= 12) {
    score += 2;
  } else if (resilience.runwayLean >= 6) {
    score += 1;
  } else if (resilience.runwayLean < 3) {
    score -= 2;
    concerns.push(`Lean runway is only ${monthsText(resilience.runwayLean)} if income stopped.`);
  }

  if (reservePlan.depositLockRatio > 0.65) {
    score -= 1;
    concerns.push(`${ratio(reservePlan.depositLockRatio)} of liquid assets become house equity on day 1.`);
  } else if (reservePlan.depositLockRatio <= 0.45) {
    score += 1;
  }

  if (score >= 8) {
    return {
      label: "Target",
      tone: "good",
      headline: "Looks resilient",
      detail: concerns[0] || `${signedPounds(scenarios.normal.slack)} in normal life, ${signedPounds(scenarios.lean.slack)} in lean mode, and ${monthsText(resilience.runwayLean)} of lean runway.`,
    };
  }

  if (score >= 5) {
    return {
      label: "Stretch",
      tone: "ok",
      headline: "Stretch but workable",
      detail: concerns.slice(0, 2).join(" ") || `You still keep ${monthsText(resilience.runwayLean)} of lean runway after purchase.`,
    };
  }

  if (score >= 2) {
    return {
      label: "Tight",
      tone: "watch",
      headline: "Tight unless the house really earns it",
      detail: concerns.slice(0, 2).join(" "),
    };
  }

  return {
    label: "Too far",
    tone: "risk",
    headline: "Too much house for the current resilience target",
    detail: concerns.slice(0, 2).join(" "),
  };
}

function buildTradeoffs({
  state,
  current,
}) {
  const higherHousePrice = clamp(state.housePrice + 100000, 200000, 2500000);
  const higherHouse = buildPurchaseOutcome({
    state,
    housePrice: higherHousePrice,
    deposit: state.deposit,
  });

  const higherDepositAmount = clamp(state.deposit + 100000, 0, state.housePrice);
  const higherDeposit = buildPurchaseOutcome({
    state,
    deposit: higherDepositAmount,
  });

  return {
    house: {
      delta: higherHousePrice - state.housePrice,
      paymentDelta: higherHouse.monthlyMortgage - current.monthlyMortgage,
      taxDelta: higherHouse.purchaseTax - current.purchaseTax,
      liquidityDelta: higherHouse.liquidAfterPurchase - current.liquidAfterPurchase,
      netWorthDelta: higherHouse.finalYear.totalNetWorth - current.finalYear.totalNetWorth,
      note: "Buys more house, but mainly by asking more from leverage and monthly tolerance.",
    },
    deposit: {
      delta: higherDeposit.home.deposit - current.home.deposit,
      paymentDelta: higherDeposit.monthlyMortgage - current.monthlyMortgage,
      liquidityDelta: higherDeposit.liquidAfterPurchase - current.liquidAfterPurchase,
      interestDelta: higherDeposit.mortgageProjection.interestPaid - current.mortgageProjection.interestPaid,
      netWorthDelta: higherDeposit.finalYear.totalNetWorth - current.finalYear.totalNetWorth,
      note: "Buys more certainty and lower burn, but at the cost of flexibility.",
    },
  };
}

function updateDecisionCard({
  state,
  current,
  takeHomeMonthly,
  scenarios,
  reservePlan,
  resilience,
  verdict,
}) {
  const grossIncome = state.incomeOne + state.incomeTwo;
  const ltv = current.home.price <= 0 ? 0 : current.home.loanAmount() / current.home.price;
  const lti = grossIncome <= 0 ? null : current.home.loanAmount() / grossIncome;
  const monthlyFit = monthlyFitLabel(scenarios.normal.slack);
  const resilienceStatus = resilienceLabel({ reservePlan, resilience });
  const leverageStatus = leverageLabel({ ltv, lti });
  const verdictShort = verdict.label === "Target" ? "Comfortable" : verdict.label;

  setText("top-house-price", pounds(state.housePrice));
  setText("top-deposit", pounds(current.home.deposit));
  setText("top-mortgage", pounds(current.home.loanAmount()));
  setText("top-ltv", ratio(ltv));
  setText("top-ltv-detail", ltvBandLabel(ltv));
  setText("top-lti", lti === null ? "n/a" : `${trimZeros(lti.toFixed(2))}x`);
  setText("top-lti-detail", ltiBandLabel(lti));
  setText("top-verdict", verdict.headline);
  setText("top-verdict-detail", `${monthlyFit} monthly fit, ${resilienceStatus.toLowerCase()} resilience.`);

  setText(
    "decision-headline",
    `House decision: ${compactPounds(state.housePrice)} house · ${compactPounds(current.home.deposit)} deposit · ${compactPounds(current.home.loanAmount())} mortgage`,
  );
  setText(
    "decision-detail",
    `Leverage: ${ratio(ltv)} LTV · ${lti === null ? "n/a" : `${trimZeros(lti.toFixed(2))}x`} LTI. Verdict: ${verdict.headline}.`,
  );

  setText("projection-net-worth", pounds(current.finalYear.totalNetWorth));
  setText(
    "projection-net-worth-detail",
    `${pounds(current.finalYear.homeEquity)} home equity plus ${pounds(current.finalYear.etfValue)} in investments.`,
  );

  setText("projection-balance", pounds(current.finalYear.balance));
  setText(
    "projection-balance-detail",
    `${pounds(current.mortgageProjection.interestPaid)} interest paid over the horizon.`,
  );

  setText("why-monthly-fit", monthlyFit);
  setText("why-monthly-fit-detail", `Normal life leaves ${signedPounds(scenarios.normal.slack)} after housing and life costs.`);
  setText("why-resilience", resilienceStatus);
  setText(
    "why-resilience-detail",
    reservePlan.reserveGap >= 0
      ? `${pounds(reservePlan.reserveGap)} above the liquid target, with ${monthsText(resilience.runwayLean)} of lean runway.`
      : `${pounds(Math.abs(reservePlan.reserveGap))} below the liquid target, with ${monthsText(resilience.runwayLean)} of lean runway.`,
  );
  setText("why-leverage", leverageStatus);
  setText(
    "why-leverage-detail",
    `${ratio(ltv)} LTV and ${lti === null ? "n/a" : `${trimZeros(lti.toFixed(2))}x`} LTI.`,
  );
  setText("top-verdict-long", verdict.headline);
  setText(
    "why-verdict-detail",
    `${verdictShort} because monthly fit is ${monthlyFit.toLowerCase()}, resilience is ${resilienceStatus.toLowerCase()}, and leverage is ${leverageStatus.toLowerCase()}.`,
  );

  // Update verdict banner
  const banner = document.getElementById('verdict-banner');
  if (banner) banner.dataset.tone = verdict.tone;

  const pill = document.getElementById('verdict-pill');
  if (pill) {
    pill.textContent = verdict.label;
    pill.className = `status-pill ${verdict.tone}`;
  }

  const ltvVal = current.home.price <= 0 ? 0 : (current.home.loanAmount() / current.home.price);
  const ltiVal = (state.incomeOne + state.incomeTwo) <= 0 ? 0 : current.home.loanAmount() / (state.incomeOne + state.incomeTwo);
  setText('vb-ltv', `${(ltvVal * 100).toFixed(1)}%`);
  setText('vb-ltv-sub', `${ltiVal.toFixed(1)}× income`);

  // Sync mobile verdict pill
  const mobilePill = document.getElementById('mobile-verdict-pill');
  if (mobilePill) {
    mobilePill.textContent = verdict.label;
    mobilePill.className = `status-pill ${verdict.tone}`;
  }
}

function updateScenarioCard({
  current,
  takeHomeMonthly,
  scenarios,
  resilience,
}) {
  document.getElementById("monthly-table-body").innerHTML = [
    metricTableRow("Net monthly income", pounds(takeHomeMonthly), "After income tax and NI."),
    metricTableRow("Housing cost", pounds(scenarios.fixedHousing), `${pounds(current.monthlyMortgage)} mortgage plus ${pounds(current.monthlyMaintenance)} maintenance.`),
    metricTableRow("Normal slack", signedPounds(scenarios.normal.slack), "After housing plus normal monthly life costs.", `slack-${scenarios.normal.tone}`),
    metricTableRow("Lean slack", signedPounds(scenarios.lean.slack), "If spending dropped to lean mode.", `slack-${scenarios.lean.tone}`),
    metricTableRow("Stress slack", signedPounds(resilience.stressedLeanSlack), "Lean mode with mortgage rate 1 point higher.", `slack-${scenarioTone(resilience.stressedLeanSlack)}`),
  ].join("");

  setText(
    "monthly-interpretation",
    monthlyInterpretation({
      scenarios,
      resilience,
    }),
  );

  // Update verdict banner monthly slack stat
  setText('vb-slack', signedPounds(scenarios.normal.slack));
  setText('vb-slack-sub', scenarios.normal.slack >= 0 ? 'after normal costs' : 'shortfall');

  // Update mobile verdict bar slack
  setText('mvb-slack', signedPounds(scenarios.normal.slack));
}

function updateResilienceCard({
  current,
  reservePlan,
  resilience,
}) {
  document.getElementById("resilience-table-body").innerHTML = [
    metricTableRow("Liquid after purchase", pounds(current.liquidAfterPurchase), "Cash and investments left after upfront costs."),
    metricTableRow("Reserve target", pounds(reservePlan.reserveTarget), "Minimum liquid buffer you want to keep."),
    metricTableRow(
      reservePlan.reserveGap >= 0 ? "Above reserve target" : "Below reserve target",
      reservePlan.reserveGap >= 0 ? pounds(reservePlan.reserveGap) : `-${pounds(Math.abs(reservePlan.reserveGap))}`,
      reservePlan.reserveGap >= 0 ? "Spare liquid capital above the target." : "Shortfall versus the target.",
      reservePlan.reserveGap >= 0 ? "slack-good" : "slack-risk",
    ),
    metricTableRow("Normal runway", monthsText(resilience.runwayNormal), "Months your remaining cash (excluding investments) covers normal spending if income stopped."),
    metricTableRow("Lean runway", monthsText(resilience.runwayLean), "Months your remaining cash (excluding investments) covers lean-mode spending if income stopped."),
  ].join("");

  setText(
    "resilience-interpretation",
    resilienceInterpretation({
      reservePlan,
      resilience,
    }),
  );

  // Update verdict banner resilience stats
  setText('vb-runway', String(Math.round(resilience.runwayLean)));
  setText('vb-reserve', signedPounds(reservePlan.reserveGap));
  setText('vb-reserve-sub', reservePlan.reserveGap >= 0 ? 'above target' : 'below target');
}

function updateReserveCard({
  current,
  reservePlan,
}) {
  document.getElementById("reserve-stack").style.width = `${reservePlan.reserveShare}%`;
  document.getElementById("deposit-stack").style.width = `${reservePlan.depositShare}%`;
  document.getElementById("tax-stack").style.width = `${reservePlan.taxShare}%`;
  document.getElementById("remaining-stack").style.width = `${reservePlan.remainingShare}%`;
  document.getElementById("reserve-gap-stack").style.width = `${reservePlan.gapShare}%`;

  setText("reserve-gap", signedPounds(reservePlan.reserveGap));
  setText(
    "reserve-gap-detail",
    reservePlan.reserveGap >= 0
      ? "Remaining cash and investments still exceed the target after purchase."
      : "The purchase would leave less liquidity than your target.",
  );

  setText(
    "reserve-stack-label",
    reservePlan.reserveShortfall > 0
      ? `Reserve covered: ${pounds(reservePlan.reserveCovered)} of ${pounds(reservePlan.reserveTarget)}`
      : `Reserve target: ${pounds(reservePlan.reserveTarget)}`,
  );
  setText("deposit-stack-label", `House equity now: ${pounds(current.home.deposit)}`);
  setText("tax-stack-label", `Purchase tax: ${pounds(current.purchaseTax)}`);
  setText("remaining-stack-label", `Liquid left above target: ${pounds(reservePlan.remainingAboveReserve)}`);
  setText("reserve-gap-stack-label", `Reserve shortfall: ${pounds(reservePlan.reserveShortfall)}`);

  setText("total-liquid-assets", pounds(reservePlan.totalLiquidAssets));
  setText("reserve-target", pounds(reservePlan.reserveTarget));
  setText("deployable-capital", pounds(reservePlan.deployableCapital));
  setText("total-upfront", pounds(current.funding.upfront));
  setText("liquid-after-purchase", pounds(current.liquidAfterPurchase));
  setText("locked-into-house", `${pounds(current.home.deposit)} (${ratio(reservePlan.depositLockRatio)})`);
  setText("purchase-tax", pounds(current.purchaseTax));
  setText("investments-remaining", pounds(current.funding.etfRemaining));
}

function updateTradeoffCard({ tradeoffs }) {
  setText("tradeoff-house-title", `House price +${compactPounds(tradeoffs.house.delta)}`);
  setText("tradeoff-house-note", tradeoffs.house.note);
  setText("tradeoff-house-payment", signedPounds(tradeoffs.house.paymentDelta));
  setText("tradeoff-house-tax", signedPounds(tradeoffs.house.taxDelta));
  setText("tradeoff-house-liquidity", signedPounds(tradeoffs.house.liquidityDelta));
  setText("tradeoff-house-networth", signedPounds(tradeoffs.house.netWorthDelta));

  setText("tradeoff-deposit-title", `Deposit +${compactPounds(tradeoffs.deposit.delta)}`);
  setText("tradeoff-deposit-note", tradeoffs.deposit.note);
  setText("tradeoff-deposit-payment", signedPounds(tradeoffs.deposit.paymentDelta));
  setText("tradeoff-deposit-liquidity", signedPounds(tradeoffs.deposit.liquidityDelta));
  setText("tradeoff-deposit-interest", signedPounds(tradeoffs.deposit.interestDelta));
  setText("tradeoff-deposit-networth", signedPounds(tradeoffs.deposit.netWorthDelta));
}

function updateDecisionSummary({
  verdict,
  scenarios,
  resilience,
  reservePlan,
}) {
  setText(
    "why-verdict-detail",
    `${verdict.headline}. Normal leaves ${signedPounds(scenarios.normal.slack)}, lean leaves ${signedPounds(scenarios.lean.slack)}, and lean runway is ${monthsText(resilience.runwayLean)}. ${
      reservePlan.reserveGap >= 0
        ? `Liquid assets remain ${pounds(reservePlan.reserveGap)} above target after purchase.`
        : `Liquid assets finish ${pounds(Math.abs(reservePlan.reserveGap))} below target after purchase.`
    }`,
  );
}

function updateIncomeCard({ me, partner }) {
  updateIncomeSlot("one", me);
  updateIncomeSlot("two", partner);
}

function updateIncomeSlot(suffix, earner) {
  const gross = earner.grossIncome;
  const taxAndNi = earner.incomeTax() + earner.nationalInsurance();
  const takeHome = earner.takeHome();
  const marginalTakeHome = earner.marginalTakeHomePerPound();

  setText(`income-${suffix}-gross`, pounds(gross));
  setText(`income-${suffix}-tax`, pounds(taxAndNi));
  setText(`income-${suffix}-net`, pounds(takeHome));
  setText(`income-${suffix}-marginal`, `${pence(marginalTakeHome)} kept from each extra £1`);
}

function updateStatusBanner({
  current,
  reservePlan,
  note,
  me,
  partner,
  state,
}) {
  const banner = document.getElementById("status-banner");
  const messages = [];
  let bannerType = "info";

  if (current.funding.fundingGap > 0) {
    bannerType = "warning";
    messages.push(`This setup is short by ${pounds(current.funding.fundingGap)} versus available cash and investments.`);
  }

  if (reservePlan.reserveGap < 0) {
    bannerType = "warning";
    messages.push(`Reserve-first check: the purchase would consume ${pounds(Math.abs(reservePlan.reserveGap))} of the reserve target.`);
  }

  if (me.grossIncome > 100000 || partner.grossIncome > 100000) {
    const activeEarners = [me, partner].filter((earner) => earner.grossIncome > 100000 && earner.grossIncome < 125140);
    if (activeEarners.length > 0) {
      messages.push(`A personal allowance taper is active. Between £100,000 and £125,140, take-home on extra salary is materially reduced under current ${taxResidenceLabel(state.taxResidence)} tax rules.`);
    }
  }

  if (note) {
    messages.push(note);
  }

  if (messages.length === 0) {
    banner.className = "status-banner";
    banner.textContent = "";
    return;
  }

  banner.className = `status-banner visible ${bannerType}`;
  banner.textContent = messages.join(" ");
}

function updateFootnote(state, purchaseTaxLabel) {
  const propertyLocation = propertyLocationLabel(state.propertyLocation);
  const residence = taxResidenceLabel(state.taxResidence);
  setText(
    "tax-footnote",
    `${purchaseTaxLabel} is calculated for ${propertyLocation} residential rates in force on 4 April 2026. Income tax and employee NI use ${residence} 2025/26 rules, which run from 6 April 2025 to 5 April 2026.`,
  );
  setText(
    "assumption-footnote",
    `Monthly life uses lean, normal, and comfortable costs excluding mortgage and maintenance. Long-run assumptions use ${percent(state.investmentReturn)} investment return, ${percent(state.houseAppreciation)} house appreciation, ${trimZeros(state.maintenanceRate.toFixed(1))}% home maintenance, and a ${years(state.projectionPeriod)} horizon.`,
  );
}

function updateStressCard({
  scenarios,
  resilience,
}) {
  document.getElementById("stress-table-body").innerHTML = [
    metricTableRow("Normal", signedPounds(scenarios.normal.slack), "Current monthly slack in normal life.", `slack-${scenarios.normal.tone}`),
    metricTableRow("Lean", signedPounds(scenarios.lean.slack), "Current monthly slack in lean mode.", `slack-${scenarios.lean.tone}`),
    metricTableRow("Rate +1%", signedPounds(resilience.stressedLeanSlack), "Lean mode with the mortgage rate 1 point higher.", `slack-${scenarioTone(resilience.stressedLeanSlack)}`),
    metricTableRow("One income only", signedPounds(resilience.singleIncomeLeanSlack), "Higher of the two incomes only, in lean mode.", `slack-${scenarioTone(resilience.singleIncomeLeanSlack)}`),
    metricTableRow("Stress runway", monthsText(resilience.runwayStress), "Months of runway in lean mode with the higher rate."),
  ].join("");
}

function updateChart(series) {
  const chart = document.getElementById("projection-chart");
  const width = 760;
  const height = 320;
  const left = 48;
  const right = 18;
  const top = 16;
  const bottom = 38;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...series.map((point) => Math.max(point.totalNetWorth, point.homeEquity, point.etfValue)),
  );

  const xAt = (index) => left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const yAt = (value) => top + innerHeight - (value / maxValue) * innerHeight;

  const gridLines = [0, 0.25, 0.5, 0.75, 1]
    .map((ratioValue) => {
      const y = top + innerHeight - ratioValue * innerHeight;
      const label = poundsCompact(maxValue * ratioValue);
      return `
        <line class="chart-grid-line" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line>
        <text class="chart-axis-label" x="8" y="${y + 4}">${label}</text>
      `;
    })
    .join("");

  const totalPath = pathForSeries(series, (point) => point.totalNetWorth, xAt, yAt);
  const equityPath = pathForSeries(series, (point) => point.homeEquity, xAt, yAt);
  const etfPath = pathForSeries(series, (point) => point.etfValue, xAt, yAt);
  const xLabels = [0, Math.floor((series.length - 1) / 2), series.length - 1]
    .filter((value, index, array) => array.indexOf(value) === index)
    .map((index) => {
      const year = series[index].year;
      return `<text class="chart-axis-label" x="${xAt(index)}" y="${height - 10}" text-anchor="middle">Year ${year}</text>`;
    })
    .join("");

  chart.innerHTML = `
    ${gridLines}
    <path class="chart-path" d="${totalPath}" stroke="var(--total-line)"></path>
    <path class="chart-path" d="${equityPath}" stroke="var(--equity-line)"></path>
    <path class="chart-path" d="${etfPath}" stroke="var(--etf-line)"></path>
    ${renderPoints(series, "var(--total-line)", (point) => point.totalNetWorth, xAt, yAt)}
    ${renderPoints(series, "var(--equity-line)", (point) => point.homeEquity, xAt, yAt)}
    ${renderPoints(series, "var(--etf-line)", (point) => point.etfValue, xAt, yAt)}
    ${xLabels}
  `;
}

function updateSnapshots(series) {
  const desiredYears = [0, Math.min(5, series[series.length - 1].year), Math.min(10, series[series.length - 1].year), series[series.length - 1].year];
  const uniqueYears = desiredYears.filter((year, index, years) => years.indexOf(year) === index);
  const snapshots = uniqueYears
    .map((year) => series.find((point) => point.year === year))
    .filter(Boolean);

  document.getElementById("projection-snapshots").innerHTML = snapshots
    .map((snapshot) => `
      <article class="snapshot-card">
        <span>Year ${snapshot.year}</span>
        <strong>${pounds(snapshot.totalNetWorth)}</strong>
        <small>${pounds(snapshot.homeEquity)} equity, ${pounds(snapshot.etfValue)} investments</small>
      </article>
    `)
    .join("");
}

function pathForSeries(series, accessor, xAt, yAt) {
  return series
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(accessor(point))}`)
    .join(" ");
}

function renderPoints(series, stroke, accessor, xAt, yAt) {
  return series
    .map((point, index) => `
      <circle class="chart-point" cx="${xAt(index)}" cy="${yAt(accessor(point))}" r="4" stroke="${stroke}"></circle>
    `)
    .join("");
}

function readInputs() {
  const state = {};
  Object.entries(inputConfig).forEach(([key, config]) => {
    state[key] = config.type === "number" ? Number(config.element.value) : config.element.value;
  });
  return state;
}

function applyInputs(values) {
  Object.entries(inputConfig).forEach(([key, config]) => {
    const value = values[key];
    config.element.value = String(value);
  });
  syncDisplays(values);
}

function storageAvailable() {
  try {
    const testKey = "__mortgage_budget_tool__";
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function readPersistedInputs() {
  if (!canPersistInputs) {
    return { ...baseline };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...baseline };
    }
    return normalizeInputs(JSON.parse(raw));
  } catch {
    return { ...baseline };
  }
}

function persistInputs(values) {
  if (!canPersistInputs) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Ignore storage write failures and keep the calculator usable.
  }
}

function clearPersistedInputs() {
  if (!canPersistInputs) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage removal failures and keep the calculator usable.
  }
}

function normalizeInputs(values) {
  const normalized = { ...baseline };
  if (!values || typeof values !== "object") {
    return normalized;
  }

  Object.entries(inputConfig).forEach(([key, config]) => {
    if (!(key in values)) {
      return;
    }

    if (config.type === "number") {
      const numericValue = Number(values[key]);
      if (Number.isFinite(numericValue)) {
        normalized[key] = numericValue;
      }
      return;
    }

    const selectedValue = String(values[key]);
    const optionExists = Array.from(config.element.options).some((option) => option.value === selectedValue);
    if (optionExists) {
      normalized[key] = selectedValue;
    }
  });

  return normalized;
}

function syncDisplays(state) {
  Object.entries(inputConfig).forEach(([key, config]) => {
    if (!config.display) {
      return;
    }
    config.display.textContent = config.format(state[key]);
  });
}

function syncDepositMax() {
  const housePrice = Number(inputConfig.housePrice.element.value);
  const depositInput = inputConfig.deposit.element;
  depositInput.max = String(housePrice);
  if (Number(depositInput.value) > housePrice) {
    depositInput.value = String(housePrice);
  }
}

function applyBandWidths(amount, bands) {
  let remaining = amount;
  let total = 0;

  bands.forEach((band) => {
    if (remaining <= 0) {
      return;
    }
    const slice = Math.min(remaining, band.width);
    total += slice * band.rate;
    remaining -= slice;
  });

  return total;
}

function steppedTax(amount, bands) {
  let total = 0;
  let lower = 0;

  bands.forEach((band) => {
    const upper = Math.min(amount, band.upTo);
    if (upper > lower) {
      total += (upper - lower) * band.rate;
      lower = upper;
    }
  });

  return total;
}

function pounds(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function poundsCompact(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function percent(value) {
  return `${Number(value).toFixed(2).replace(/\.00$/, "")}% p.a.`;
}

function years(value) {
  return `${value} years`;
}

function ratio(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function pence(value) {
  return `${Math.round(value * 100)}p`;
}

function buyerStatusLabel(value) {
  if (value === "first-time") {
    return "first-time buyer";
  }
  if (value === "additional-home") {
    return "additional home";
  }
  return "main home";
}

function propertyLocationLabel(value) {
  if (value === "england-ni") {
    return "England or Northern Ireland";
  }
  if (value === "scotland") {
    return "Scotland";
  }
  return "Wales";
}

function taxResidenceLabel(value) {
  return value === "scotland" ? "Scottish" : "England / Wales / Northern Ireland";
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (!el || el.textContent === String(val)) return;
  el.textContent = val;
  el.classList.remove('value-updated');
  void el.offsetWidth;
  el.classList.add('value-updated');
}

function signedPounds(value) {
  return value < 0 ? `-${pounds(Math.abs(value))}` : pounds(value);
}

function compactPounds(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (Math.abs(value) >= 1000000) {
    return `£${trimZeros((value / 1000000).toFixed(2))}M`;
  }

  if (Math.abs(value) >= 1000) {
    return `£${Math.round(value / 1000)}k`;
  }

  return pounds(value);
}

function trimZeros(value) {
  return value.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function monthlyMaintenanceFor(price, maintenanceRate) {
  return (price * (maintenanceRate / 100)) / 12;
}

function monthlyTakeHomeForGross(taxResidence, incomeOne, incomeTwo) {
  return (
    new Earner(incomeOne, taxResidence).takeHome() +
    new Earner(incomeTwo, taxResidence).takeHome()
  ) / 12;
}

function runwayMonths(liquidAssets, monthlyBurn) {
  if (liquidAssets <= 0) {
    return 0;
  }
  if (monthlyBurn <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return liquidAssets / monthlyBurn;
}

function monthsText(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (value >= 24) {
    return `${Math.round(value)} months`;
  }
  return `${trimZeros(value.toFixed(1))} months`;
}

function percentageOf(value, total) {
  if (total <= 0) {
    return 0;
  }
  return (value / total) * 100;
}

function scenarioTone(slack) {
  if (slack >= 1500) {
    return "good";
  }
  if (slack >= 0) {
    return "watch";
  }
  return "risk";
}

function metricTableRow(label, value, meaning, valueClass = "") {
  return `
    <div class="scenario-table-row">
      <span class="scenario-mode">${label}</span>
      <span class="scenario-value ${valueClass}">${value}</span>
      <span>${meaning}</span>
    </div>
  `;
}

function ltvBandLabel(ltv) {
  if (!Number.isFinite(ltv)) {
    return "n/a";
  }
  if (ltv < 0.5) {
    return "Low leverage";
  }
  if (ltv < 0.7) {
    return "Target band";
  }
  if (ltv < 0.8) {
    return "Stretched";
  }
  return "Aggressive";
}

function ltiBandLabel(lti) {
  if (!Number.isFinite(lti)) {
    return "No income";
  }
  if (lti < 3.5) {
    return "Conservative";
  }
  if (lti <= 4.5) {
    return "Normal";
  }
  return "Stretched";
}

function monthlyFitLabel(normalSlack) {
  if (normalSlack >= 1500) {
    return "Comfortable";
  }
  if (normalSlack >= 500) {
    return "Workable";
  }
  if (normalSlack >= 0) {
    return "Tight";
  }
  return "Negative";
}

function resilienceLabel({ reservePlan, resilience }) {
  if (reservePlan.reserveGap >= 0 && resilience.runwayLean >= 12) {
    return "Strong";
  }
  if (reservePlan.reserveGap >= 0 && resilience.runwayLean >= 6) {
    return "Adequate";
  }
  if (reservePlan.reserveGap >= -25000 && resilience.runwayLean >= 3) {
    return "Watch";
  }
  return "Weak";
}

function leverageLabel({ ltv, lti }) {
  if (!Number.isFinite(lti)) {
    return "No income";
  }
  if (ltv < 0.5 && lti < 3.5) {
    return "Conservative";
  }
  if (ltv < 0.7 && lti <= 4.5) {
    return "Normal";
  }
  if (ltv < 0.8 && lti <= 5) {
    return "Stretched";
  }
  return "Aggressive";
}

function monthlyInterpretation({ scenarios, resilience }) {
  if (scenarios.normal.slack < 0) {
    return `Normal life is negative by ${pounds(Math.abs(scenarios.normal.slack))} per month. The setup only works if you rely on lean mode or future changes.`;
  }
  if (scenarios.normal.slack < 500) {
    return `This house is affordable, but normal life has little spare room. The main risk is month-to-month tightness, not immediate instability.`;
  }
  if (resilience.stressedLeanSlack < 0) {
    return `Normal life works today, but a higher-rate reset would put pressure on the lean fallback.`;
  }
  return `Monthly life looks workable. Normal and lean modes stay positive, with lean mode still holding up under a modest rate shock.`;
}

function resilienceInterpretation({ reservePlan, resilience }) {
  if (reservePlan.reserveGap < 0 && resilience.runwayLean < 6) {
    return `Post-purchase resilience looks weak. Liquidity misses the target and the lean runway is only ${monthsText(resilience.runwayLean)}.`;
  }
  if (reservePlan.reserveGap < 0) {
    return `Monthly resilience is reasonable, but the purchase would leave less liquidity than the target.`;
  }
  if (resilience.runwayLean >= 12) {
    return `Strong post-purchase resilience. You are not fragile after buying.`;
  }
  return `Resilience remains acceptable after purchase, though the liquid buffer is not especially large relative to monthly burn.`;
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected', 'false'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.setAttribute('aria-selected', 'true');
    document.querySelector(`.tab-panel[data-panel="${btn.dataset.tab}"]`).classList.add('active');
  });
});
// Activate first tab on load
document.querySelector('.tab-panel[data-panel="monthly"]').classList.add('active');

// Advanced drawer toggle
const advToggle = document.getElementById('advanced-toggle');
const advDrawer = document.getElementById('advanced-drawer');
if (advToggle && advDrawer) {
  advToggle.addEventListener('click', () => {
    const open = advDrawer.classList.toggle('open');
    advToggle.setAttribute('aria-expanded', String(open));
  });
}

// Mobile inputs drawer
(function () {
  const panel   = document.getElementById('controls-panel');
  const overlay = document.getElementById('inputs-overlay');
  const openBtn = document.getElementById('inputs-open-btn');
  const closeBtn = document.getElementById('inputs-close-btn');
  if (!panel || !overlay || !openBtn) return;

  function openDrawer() {
    overlay.classList.add('visible');
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      panel.classList.add('drawer-open');
    });
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    overlay.classList.remove('open');
    panel.classList.remove('drawer-open');
    overlay.addEventListener('transitionend', () => overlay.classList.remove('visible'), { once: true });
    document.body.style.overflow = '';
  }

  openBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
})();

// Tooltip system — appended to <body> so it escapes all overflow containers
(function () {
  const tip = document.createElement('div');
  tip.className = 'js-tooltip';
  document.body.appendChild(tip);

  function show(el) {
    tip.textContent = el.dataset.tooltip;
    tip.style.display = 'block';
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth;
      // Centre under the element, nudge if near edges
      let left = r.left + r.width / 2 - tw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
      let top = r.bottom + 8;
      // If it would go off the bottom, flip above
      if (top + tip.offsetHeight > window.innerHeight - 8) {
        top = r.top - tip.offsetHeight - 8;
      }
      tip.style.left = left + 'px';
      tip.style.top  = top  + 'px';
      tip.style.opacity = '1';
    });
  }

  function hide() {
    tip.style.opacity = '0';
    tip.style.display = 'none';
  }

  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tooltip]');
    if (el) show(el);
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-tooltip]')) hide();
  });
})();
