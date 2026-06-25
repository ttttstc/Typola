type ErrorRetryCardProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorRetryCard({ message, onRetry }: ErrorRetryCardProps) {
  if (!message) return null;
  return (
    <div className="conversation-error-card">
      <strong>AI Provider 运行异常</strong>
      <p>{message}</p>
      {onRetry && <button type="button" onClick={onRetry}>重试</button>}
    </div>
  );
}
