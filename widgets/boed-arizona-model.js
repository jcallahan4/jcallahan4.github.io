/* Shared probability model for the dissertation's experimental-design sequence. */
(function () {
  "use strict";
  var n = 1600, step = 10 / n, grid = [], prior = [], cdf = [0];
  // Prior q(θ) = 0.6 N(3.6,1.1²) + 0.4 N(7.1,0.75²), normalized on [0,10].
  function normal(x, mu, sd) {
    var z = (x - mu) / sd;
    return Math.exp(-z * z / 2) / (sd * Math.sqrt(2 * Math.PI));
  }
  // Composite trapezoidal integration: Δθ[(f₀+fₙ)/2 + Σᵢ₌₁ⁿ⁻¹fᵢ].
  function integrate(values) {
    var sum = (values[0] + values[n]) / 2;
    for (var i = 1; i < n; i++) sum += values[i];
    return step * sum;
  }
  for (var i = 0; i <= n; i++) {
    grid.push(i * step);
    prior.push(0.6 * normal(i * step, 3.6, 1.1) + 0.4 * normal(i * step, 7.1, 0.75));
  }
  var area = integrate(prior);
  prior = prior.map(function (p) { return p / area; });
  for (var j = 1; j <= n; j++) cdf.push(cdf[j - 1] + step * (prior[j - 1] + prior[j]) / 2);
  cdf[n] = 1;
  // Inverse-square forward model g(θ,d) = 1/(d-θ)². All candidate sensors lie beyond θ = 10.
  function signal(theta, design) { return 1 / Math.pow(design - theta, 2); }
  function posterior(observation, design, sigma) {
    // Y|θ,d ~ N(g(θ,d),σ²). Subtract the maximum log weight to avoid underflow.
    var logLikelihood = grid.map(function (theta) { return -0.5 * Math.pow((observation - signal(theta, design)) / sigma, 2); });
    var logWeights = prior.map(function (p, i) { return Math.log(p) + logLikelihood[i]; });
    var shift = Math.max.apply(null, logWeights);
    var weights = logWeights.map(function (w) { return Math.exp(w - shift); });
    var mass = integrate(weights);
    var density = weights.map(function (w) { return w / mass; });
    // Bayes: p(θ|y,d) ∝ p(θ)L(θ). KL = ∫p(θ|y,d)[log L(θ)-log ∫p(u)L(u)du]dθ.
    // Natural logarithms give information gain in nats.
    var logMass = shift + Math.log(mass);
    var ig = integrate(density.map(function (p, i) { return p * (logLikelihood[i] - logMass); }));
    return {density: density, ig: Math.max(0, ig), observation: observation, design: design, sigma: sigma};
  }
  // Xorshift32 (Marsaglia, 2003) supplies a repeatable uniform pseudorandom sequence.
  function random(seed) {
    var state = seed >>> 0 || 1;
    return function () {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      return ((state >>> 0) + 0.5) / 4294967296;
    };
  }
  // Inverse-CDF sampling θ = F⁻¹(U), with linear interpolation of the integrated prior.
  function sampleSource(rng) {
    var u = rng(), lo = 0, hi = n;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid; else hi = mid;
    }
    return step * (lo + (u - cdf[lo]) / (cdf[hi] - cdf[lo]));
  }
  // Box-Muller: Z = √(-2 log U₁) cos(2πU₂), with Z ~ N(0,1).
  function sampleNormal(rng) { return Math.sqrt(-2 * Math.log(rng())) * Math.cos(2 * Math.PI * rng()); }
  function experiment(rng, design, sigma) {
    var source = sampleSource(rng);
    // A hypothetical measurement is y′ = g(θ′,d) + σZ; each experiment starts from the same prior.
    var observation = signal(source, design) + sigma * sampleNormal(rng);
    var result = posterior(observation, design, sigma);
    result.source = source;
    return result;
  }
  window.BoedArizona = {grid: grid, prior: prior, integrate: integrate, signal: signal,
    posterior: posterior, random: random, sampleSource: sampleSource, sampleNormal: sampleNormal,
    experiment: experiment, design: 12, sigma: 0.006};
})();
