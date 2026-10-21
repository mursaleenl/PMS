import { ArrowRight, Clock3, Receipt } from "lucide-react";
import Link from "next/link";

export default function InvoiceGeneratorPage() {
  return <div className="page-content invoice-module-page">
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="live-dot"/>COMMERCIAL · INVOICE MODULE</div>
        <h1>Invoice generator</h1>
        <p className="welcome-subtitle">A dedicated workspace for creating and managing project invoices.</p>
      </div>
      <button className="button button-quiet" type="button" disabled><Receipt size={15}/>Create invoice</button>
    </section>

    <section className="panel invoice-module-placeholder">
      <span className="empty-icon"><Receipt size={22}/></span>
      <span className="invoice-module-badge"><Clock3 size={12}/>MODULE RESERVED</span>
      <h2>Invoice tools are coming later</h2>
      <p>This page is the home for the future invoice generator. No invoices or sample data are shown here yet.</p>
      <div className="invoice-module-note">
        <strong>Current deposit invoice flow</strong>
        <span>Deposit invoice records are still created from an accepted proposal in the request pipeline.</span>
        <Link href="/requests">Open request pipeline <ArrowRight size={14}/></Link>
      </div>
    </section>
  </div>;
}
