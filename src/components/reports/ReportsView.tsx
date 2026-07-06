import React, { useEffect, useRef } from 'react';
import { Chart, DoughnutController, BarController, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { User, Case, Financials } from '../../utils/types';

// Register necessary Chart.js elements
Chart.register(
  DoughnutController,
  BarController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);

interface ReportsViewProps {
  currentUser: User;
  cases: Case[];
  financials: Financials;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ currentUser, cases, financials }) => {
  const casesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const billingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const casesChartInst = useRef<Chart | null>(null);
  const billingChartInst = useRef<Chart | null>(null);

  // Group cases by practice area
  const areas = ['Civil', 'Penal', 'Laboral', 'Tributario', 'Corporativo'];
  const counts = areas.map((area) => cases.filter((c) => c.practiceArea === area).length);

  // Check if current user is allowed to view reports (Partner and TI Admin only)
  const isAllowed = currentUser.role === 'TI Administrador' || currentUser.role === 'Socio Principal';

  useEffect(() => {
    if (!isAllowed) return;

    // Render Doughnut Chart
    if (casesCanvasRef.current) {
      if (casesChartInst.current) {
        casesChartInst.current.destroy();
      }

      const ctx = casesCanvasRef.current.getContext('2d');
      if (ctx) {
        casesChartInst.current = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: areas,
            datasets: [
              {
                data: counts,
                backgroundColor: [
                  'hsl(38, 70%, 55%)', // Gold (Civil)
                  'hsl(355, 84%, 55%)', // Red (Penal)
                  'hsl(142, 70%, 45%)', // Green (Laboral)
                  'hsl(199, 89%, 48%)', // Blue (Tributario)
                  'hsl(271, 70%, 60%)' // Purple (Corporativo)
                ],
                borderColor: 'hsl(223, 47%, 12%)',
                borderWidth: 2,
                hoverOffset: 8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  color: 'hsl(215, 20%, 72%)',
                  font: {
                    family: 'Inter',
                    size: 11
                  },
                  padding: 15
                }
              },
              tooltip: {
                backgroundColor: 'hsla(223, 47%, 8%, 0.95)',
                titleColor: 'hsl(38, 70%, 55%)',
                bodyColor: 'hsl(210, 40%, 98%)',
                borderColor: 'hsla(38, 70%, 55%, 0.3)',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  label: function (context) {
                    const total = context.dataset.data.reduce((a: any, b: any) => a + b, 0) as number;
                    const value = context.raw as number;
                    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                    return ` ${context.label}: ${value} expedientes (${percentage}%)`;
                  }
                }
              }
            },
            cutout: '70%'
          }
        });
      }
    }

    // Render Bar Chart
    if (billingCanvasRef.current) {
      if (billingChartInst.current) {
        billingChartInst.current.destroy();
      }

      const monthsData = financials.monthlyRevenue || [];
      const labels = monthsData.map((d) => d.month);
      const billedValues = monthsData.map((d) => d.billed);
      const collectedValues = monthsData.map((d) => d.collected);

      const ctx = billingCanvasRef.current.getContext('2d');
      if (ctx) {
        billingChartInst.current = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Monto Facturado ($)',
                data: billedValues,
                backgroundColor: 'hsla(38, 70%, 55%, 0.2)',
                borderColor: 'hsl(38, 70%, 55%)',
                borderWidth: 1.5,
                borderRadius: 4
              },
              {
                label: 'Monto Cobrado ($)',
                data: collectedValues,
                backgroundColor: 'hsla(142, 70%, 45%, 0.25)',
                borderColor: 'hsl(142, 70%, 45%)',
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
                position: 'top',
                labels: {
                  color: 'hsl(215, 20%, 72%)',
                  font: {
                    family: 'Inter',
                    size: 11
                  }
                }
              },
              tooltip: {
                backgroundColor: 'hsla(223, 47%, 8%, 0.95)',
                titleColor: 'hsl(38, 70%, 55%)',
                bodyColor: 'hsl(210, 40%, 98%)',
                borderColor: 'hsla(38, 70%, 55%, 0.3)',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  label: function (context) {
                    const labelStr = context.dataset.label ? context.dataset.label.split(' ($')[0] : '';
                    const rawVal = context.raw as number;
                    return ` ${labelStr}: $${rawVal.toLocaleString()}`;
                  }
                }
              }
            },
            scales: {
              x: {
                grid: {
                  color: 'hsla(223, 30%, 22%, 0.2)'
                },
                ticks: {
                  color: 'hsl(215, 20%, 72%)',
                  font: {
                    family: 'Inter',
                    size: 10
                  }
                }
              },
              y: {
                grid: {
                  color: 'hsla(223, 30%, 22%, 0.2)'
                },
                ticks: {
                  color: 'hsl(215, 20%, 72%)',
                  font: {
                    family: 'Inter',
                    size: 10
                  },
                  callback: function (value) {
                    return '$' + (Number(value) / 1000000) + 'M';
                  }
                }
              }
            }
          }
        });
      }
    }

    return () => {
      if (casesChartInst.current) {
        casesChartInst.current.destroy();
      }
      if (billingChartInst.current) {
        billingChartInst.current.destroy();
      }
    };
  }, [cases, financials, isAllowed]);

  if (!isAllowed) {
    return (
      <section className="view-panel active" id="view-reports">
        <div className="permission-blocked">
          <div className="blocked-message">
            <h3 className="serif" style={{ fontSize: '20px', marginBottom: '8px' }}>Acceso Restringido</h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
              Solo los Socios Principales y el TI Administrador tienen privilegios para acceder al módulo de analítica avanzada y reportes financieros.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // Lawyer performance data (mocked/semi-dynamic from default_users)
  const lawyerPerformance = [
    { name: 'Dr. Carlos Mendoza', role: 'Socio Principal', cases: cases.filter(c => c.assignedLawyerId === 'usr-01').length, hours: 78, billed: 12500000, rate: '96%' },
    { name: 'Dra. Sofía Valenzuela', role: 'Abogado Senior', cases: cases.filter(c => c.assignedLawyerId === 'usr-02').length, hours: 64, billed: 8200000, rate: '88%' },
    { name: 'Lic. Mateo Ríos', role: 'Abogado Junior', cases: cases.filter(c => c.assignedLawyerId === 'usr-03').length, hours: 42, billed: 3800000, rate: '92%' }
  ];

  return (
    <section className="view-panel active" id="view-reports">
      <div id="reports-blocked-overlay">
        <div className="section-header">
          <div>
            <span className="metric-trend up">Analítica Avanzada</span>
            <h2 className="serif" style={{ fontSize: '26px', marginTop: '4px' }}>Reportes e Inteligencia de Negocios</h2>
          </div>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => alert('Simulación de Exportación: Reporte PDF generado y guardado en su dispositivo.')}
          >
            Exportar Reporte
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="metrics-grid">
          <div className="glass-card metric-card">
            <div className="metric-title">Facturación Anual Proyectada</div>
            <div className="metric-value" id="report-projected-revenue">$37,300,000</div>
            <div className="metric-sub">Bajo estimaciones Q1-Q2</div>
          </div>
          <div className="glass-card metric-card">
            <div className="metric-title">Cuentas por Cobrar</div>
            <div className="metric-value" id="report-pending-collection">$12,800,000</div>
            <div className="metric-sub">Facturas pendientes de pago</div>
          </div>
          <div className="glass-card metric-card">
            <div className="metric-title">Promedio Tarifa Horaria</div>
            <div className="metric-value">$85,000</div>
            <div className="metric-sub">Ponderado por roles jurídicos</div>
          </div>
          <div className="glass-card metric-card">
            <div className="metric-title">Tasa de Éxito en Juicios</div>
            <div className="metric-value">82%</div>
            <div className="metric-sub">Casos con resolución favorable</div>
          </div>
        </div>

        {/* Charts Layout */}
        <div className="reports-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
          <div className="glass-card">
            <h3 className="section-title" style={{ marginBottom: '16px' }}>Distribución de Casos por Área</h3>
            <div className="chart-container" style={{ height: '220px', position: 'relative' }}>
              <canvas ref={casesCanvasRef} id="chart-cases-area" />
            </div>
          </div>

          <div className="glass-card">
            <h3 className="section-title" style={{ marginBottom: '16px' }}>Rendimiento de Facturación Q2</h3>
            <div className="chart-container" style={{ height: '220px', position: 'relative' }}>
              <canvas ref={billingCanvasRef} id="chart-billing-performance" />
            </div>
          </div>
        </div>

        {/* Lawyer Performance Table */}
        <div className="glass-card" style={{ marginTop: '20px' }}>
          <div className="section-header">
            <h3 className="section-title">Desempeño Operativo y Cobros por Abogado</h3>
          </div>
          <div className="table-responsive">
            <table className="custom-table" id="reports-lawyers-table">
              <thead>
                <tr>
                  <th>Abogado</th>
                  <th>Rol</th>
                  <th>Casos Asignados</th>
                  <th>Horas Registradas</th>
                  <th>Facturado del Mes</th>
                  <th>Tasa de Cobro</th>
                </tr>
              </thead>
              <tbody>
                {lawyerPerformance.map((lp, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600 }}>{lp.name}</td>
                    <td>{lp.role}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary-gold)' }}>{lp.cases}</td>
                    <td>{lp.hours} hrs</td>
                    <td>${lp.billed.toLocaleString()}</td>
                    <td>
                      <span className="badge badge-active" style={{ backgroundColor: 'rgba(52, 199, 89, 0.08)', color: 'var(--success)' }}>
                        {lp.rate}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
