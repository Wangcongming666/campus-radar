import {
  createContext,
  useContext,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Inbox } from "lucide-react";
export type Tone = "cyan" | "green" | "purple" | "amber" | "red" | "muted";
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`button button-${variant} button-${size} ${className}`}
    />
  );
}
export function PageHeader({
  title,
  description,
  actions,
  count,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  count?: number;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>
          {title}
          {count !== undefined && <span className="title-count">{count}</span>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
const ModalDepthContext = createContext(0);
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "sm",
  onCloseAutoFocus,
  dismissOnOutside = true,
  layer,
  preserveInputFocusOnBlankClick = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "lg" | "drawer";
  onCloseAutoFocus?: (event: Event) => void;
  dismissOnOutside?: boolean;
  layer?: number;
  preserveInputFocusOnBlankClick?: boolean;
}) {
  const inheritedDepth = useContext(ModalDepthContext);
  const depth = layer ?? inheritedDepth;
  const descriptionId = useId();
  return (
    <ModalDepthContext.Provider value={depth + 1}>
      <Dialog.Root
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="modal-backdrop"
            style={{ zIndex: 100 + depth * 10 }}
          />
          <Dialog.Content
            className={`modal modal-${size}`}
            style={{ zIndex: 101 + depth * 10 }}
            onCloseAutoFocus={onCloseAutoFocus}
            onPointerDownCapture={(event) => {
              if (
                !preserveInputFocusOnBlankClick ||
                event.pointerType !== "mouse" ||
                event.button !== 0
              )
                return;
              const target = event.target;
              const active = document.activeElement;
              // Ignore portal events from a child modal, controls, labels, and selectable text.
              if (
                !(target instanceof HTMLElement) ||
                !event.currentTarget.contains(target) ||
                !active ||
                !event.currentTarget.contains(active) ||
                !active.matches("input,textarea,select")
              )
                return;
              if (
                ["DIV", "SECTION", "FORM", "UL", "OL"].includes(
                  target.tagName,
                ) &&
                !target.closest(
                  "button,a,input,textarea,select,label,[contenteditable=true],[role=button]",
                )
              )
                event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!dismissOnOutside) event.preventDefault();
            }}
            aria-describedby={description ? descriptionId : undefined}
          >
            <div className="modal-heading">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="icon-button modal-close-button"
                  aria-label="关闭"
                >
                  <X />
                </button>
              </Dialog.Close>
            </div>
            {description && (
              <Dialog.Description id={descriptionId} className="muted small">
                {description}
              </Dialog.Description>
            )}
            <div className="modal-body">{children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ModalDepthContext.Provider>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function Metric({
  label,
  value,
  hint,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Avatar({
  name,
  color,
  size = "md",
}: {
  name: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={
        color ? ({ "--avatar-color": color } as React.CSSProperties) : undefined
      }
    >
      {name.slice(0, 1)}
    </span>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          className={value === t.value ? "active" : ""}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
