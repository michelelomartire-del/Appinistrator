import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  block,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  block?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`.trim()}
    >
      {loading ? <span className="spinner spinner--inline" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/* --------------------------------- Campi ---------------------------------- */

let fieldCounter = 0;

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  const generated = useId();
  const id = htmlFor ?? generated;
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__required" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${className}`.trim()} />;
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input input--textarea ${className}`.trim()} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`input input--select ${className}`.trim()}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

/* --------------------------------- Badge ---------------------------------- */

const badgeTones: Record<string, string> = {
  potenziale: 'warning',
  attivo: 'success',
  cessato: 'neutral',
  nuova: 'info',
  in_valutazione: 'warning',
  assegnata: 'info',
  in_corso: 'info',
  risolta: 'success',
  chiusa: 'neutral',
  bassa: 'neutral',
  media: 'info',
  alta: 'warning',
  urgente: 'danger',
  programmata: 'info',
  convocata: 'warning',
  svolta: 'success',
  annullata: 'neutral',
  bozza: 'warning',
  chiuso: 'neutral',
  pagata: 'success',
  parziale: 'warning',
  aperta: 'info',
  scaduta: 'danger',
  inserito: 'neutral',
  importato: 'info',
  stimato: 'warning',
};

export function Badge({ value, label, tone }: { value?: string; label: string; tone?: string }) {
  const resolved = tone ?? (value ? badgeTones[value] : undefined) ?? 'neutral';
  return <span className={`badge badge--${resolved}`}>{label}</span>;
}

/* --------------------------------- Card ----------------------------------- */

export function Card({
  title,
  description,
  actions,
  children,
  className = '',
  as: Tag = 'section',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={`card ${className}`.trim()}>
      {(title || actions) && (
        <header className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {description ? <p className="card__description">{description}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </Tag>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  backTo,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
}) {
  return (
    <div className="page-header">
      <div className="page-header__main">
        {backTo ? (
          <Link to={backTo} className="back-link">
            ← Indietro
          </Link>
        ) : null}
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <div className="page-header__subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------ Stati vuoti -------------------------------- */

export function EmptyState({
  title,
  description,
  action,
  icon = '📋',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'Caricamento in corso…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert--danger" role="alert">
      <div>
        <strong>Non è stato possibile completare l’operazione.</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Riprova
        </Button>
      ) : null}
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <div>
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------- Modale ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Chiudi finestra">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Conferma',
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Annulla
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
    </Modal>
  );
}

/* --------------------------------- Tabelle --------------------------------- */

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  return (
    <div className="pagination" aria-label="Paginazione">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Precedente
      </Button>
      <span className="pagination__info">
        Pagina {page} di {pages} · {total} risultati
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Successiva →
      </Button>
    </div>
  );
}

/* --------------------------------- Tab ------------------------------------- */

export function Tabs({
  items,
  active,
}: {
  items: Array<{ key: string; label: string; to: string; count?: number }>;
  active: string;
}) {
  return (
    <nav className="tabs" aria-label="Sezioni">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={`tabs__item ${active === item.key ? 'is-active' : ''}`}
          aria-current={active === item.key ? 'page' : undefined}
        >
          {item.label}
          {item.count !== undefined ? <span className="tabs__count">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/* -------------------------------- Descrizioni ------------------------------ */

export function DescriptionList({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; full?: boolean }>;
}) {
  return (
    <dl className="description-list">
      {items.map((item) => (
        <div key={item.label} className={`description-list__item ${item.full ? 'is-full' : ''}`}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? <span className="muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------- Toast ----------------------------------- */

type Toast = { id: number; message: string; tone: 'success' | 'danger' | 'info' };
type ToastContextValue = { notify: (message: string, tone?: Toast['tone']) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++counter.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) return { notify: () => undefined };
  return ctx;
}

/* ----------------------------- Utilità di stato ---------------------------- */

export function stateLabel(
  map: Record<string, string>,
  value: string | null | undefined,
): string {
  if (!value) return '—';
  return map[value] ?? value;
}

export { fieldCounter };
