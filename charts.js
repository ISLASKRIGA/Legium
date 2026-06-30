/**
 * charts.js - Legium Charting Engine (Chart.js Integration)
 */

const LegiumCharts = {
  casesChart: null,
  financeChart: null,

  init: function() {
    this.renderCasesAreaChart();
    this.renderFinanceChart();
  },

  renderCasesAreaChart: function() {
    const canvas = document.getElementById("chart-cases-area");
    if (!canvas) return;

    // Fetch data from DB
    const cases = window.LegiumDB.get("cases", []);
    
    // Group cases by practice area
    const areas = ["Civil", "Penal", "Laboral", "Tributario", "Corporativo"];
    const counts = areas.map(area => cases.filter(c => c.practiceArea === area).length);

    // If chart already exists, destroy it first to avoid canvas conflicts
    if (this.casesChart) {
      this.casesChart.destroy();
    }

    const ctx = canvas.getContext("2d");
    this.casesChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: areas,
        datasets: [{
          data: counts,
          backgroundColor: [
            "hsl(38, 70%, 55%)",   // Gold (Civil)
            "hsl(355, 84%, 55%)",  // Red (Penal)
            "hsl(142, 70%, 45%)",  // Green (Laboral)
            "hsl(199, 89%, 48%)",  // Blue (Tributario)
            "hsl(271, 70%, 60%)"   // Purple (Corporativo)
          ],
          borderColor: "hsl(223, 47%, 12%)",
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              color: "hsl(215, 20%, 72%)",
              font: {
                family: "Inter",
                size: 11
              },
              padding: 15
            }
          },
          tooltip: {
            backgroundColor: "hsla(223, 47%, 8%, 0.95)",
            titleColor: "hsl(38, 70%, 55%)",
            bodyColor: "hsl(210, 40%, 98%)",
            borderColor: "hsla(38, 70%, 55%, 0.3)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const value = context.raw;
                const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                return ` ${context.label}: ${value} expedientes (${percentage}%)`;
              }
            }
          }
        },
        cutout: "70%"
      }
    });
  },

  renderFinanceChart: function() {
    const canvas = document.getElementById("chart-billing-performance");
    if (!canvas) return;

    const financials = window.LegiumDB.get("financials", {});
    const monthsData = financials.monthlyRevenue || [];

    const labels = monthsData.map(d => d.month);
    const billedValues = monthsData.map(d => d.billed);
    const collectedValues = monthsData.map(d => d.collected);

    if (this.financeChart) {
      this.financeChart.destroy();
    }

    const ctx = canvas.getContext("2d");
    this.financeChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Monto Facturado ($)",
            data: billedValues,
            backgroundColor: "hsla(38, 70%, 55%, 0.2)",
            borderColor: "hsl(38, 70%, 55%)",
            borderWidth: 1.5,
            borderRadius: 4
          },
          {
            label: "Monto Cobrado ($)",
            data: collectedValues,
            backgroundColor: "hsla(142, 70%, 45%, 0.25)",
            borderColor: "hsl(142, 70%, 45%)",
            borderWidth: 1.5,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "hsl(215, 20%, 72%)",
              font: {
                family: "Inter",
                size: 11
              }
            }
          },
          tooltip: {
            backgroundColor: "hsla(223, 47%, 8%, 0.95)",
            titleColor: "hsl(38, 70%, 55%)",
            bodyColor: "hsl(210, 40%, 98%)",
            borderColor: "hsla(38, 70%, 55%, 0.3)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                return ` ${context.dataset.label.split(' ($')[0]}: $${context.raw.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: "hsla(223, 30%, 22%, 0.2)"
            },
            ticks: {
              color: "hsl(215, 20%, 72%)",
              font: {
                family: "Inter",
                size: 10
              }
            }
          },
          y: {
            grid: {
              color: "hsla(223, 30%, 22%, 0.2)"
            },
            ticks: {
              color: "hsl(215, 20%, 72%)",
              font: {
                family: "Inter",
                size: 10
              },
              callback: function(value) {
                return "$" + (value / 1000000) + "M";
              }
            }
          }
        }
      }
    });
  },

  update: function() {
    this.renderCasesAreaChart();
    this.renderFinanceChart();
  }
};

window.LegiumCharts = LegiumCharts;
