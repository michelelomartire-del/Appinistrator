import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";

export function NotFound() {
  return (
    <EmptyState
      icon="🧭"
      title="Pagina non trovata"
      description="Il collegamento non esiste o è stato spostato."
      action={<Link to="/">Torna alla dashboard</Link>}
    />
  );
}
