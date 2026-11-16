// Coarser practice groups: each College Board topic code belongs to exactly one group of its unit.
export const GROUPS: Record<string, [string, string[]][]> = {
  "1": [["Limits: graphs, tables, algebra, squeeze", ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9"]], ["Continuity, discontinuities and the IVT", ["1.10", "1.11", "1.12", "1.13", "1.16"]], ["Infinite limits and asymptotes", ["1.14", "1.15"]]],
  "2": [["Rates of change and the definition of the derivative", ["2.1", "2.2", "2.3", "2.4"]], ["Basic derivative rules: power, sum, trig, product, quotient", ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10"]]],
  "3": [["Chain rule and implicit differentiation", ["3.1", "3.2"]], ["Inverse functions, choosing a rule and higher-order derivatives", ["3.3", "3.4", "3.5", "3.6"]]],
  "4": [["Meaning of the derivative, motion and applied rates", ["4.1", "4.2", "4.3"]], ["Related rates", ["4.4", "4.5"]], ["Linearization and L'Hospital's rule", ["4.6", "4.7"]]],
  "5": [["Mean Value Theorem and extrema", ["5.1", "5.2", "5.5"]], ["Increasing/decreasing, concavity and derivative tests", ["5.3", "5.4", "5.6", "5.7"]], ["Graphs of f, f′ and f″; implicit relations", ["5.8", "5.9", "5.12"]], ["Optimization", ["5.10", "5.11"]]],
  "6": [["Riemann sums and accumulation of change", ["6.1", "6.2", "6.3"]], ["Fundamental Theorem, definite integrals and accumulation functions", ["6.4", "6.5", "6.6", "6.7"]], ["Antiderivatives and integration techniques", ["6.8", "6.9", "6.10", "6.11", "6.12", "6.13", "6.14"]]],
  "7": [["Differential equations and slope fields", ["7.1", "7.2", "7.3", "7.4"]], ["Separation of variables and exponential models", ["7.6", "7.7", "7.8"]], ["Euler's method and logistic models", ["7.5", "7.9"]]],
  "8": [["Average value, motion and accumulation with integrals", ["8.1", "8.2", "8.3"]], ["Area between curves", ["8.4", "8.5", "8.6"]], ["Volumes with cross sections", ["8.7", "8.8"]], ["Volumes of revolution: disc and washer", ["8.9", "8.10", "8.11", "8.12"]], ["Arc length", ["8.13"]]],
  "9": [["Parametric equations and vector-valued functions", ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"]], ["Polar coordinates and polar area", ["9.7", "9.8", "9.9"]]],
  "10": [["Convergence of series", ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9"]], ["Taylor polynomials and error bounds", ["10.10", "10.11", "10.12"]], ["Power series and Taylor series", ["10.13", "10.14", "10.15"]]],
};
