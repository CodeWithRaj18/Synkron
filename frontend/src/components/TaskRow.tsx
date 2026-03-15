import { TaskAssignment } from '../types/types';

type TaskRowProps = {
  task: TaskAssignment;
};

function deriveReasonPoints(task: TaskAssignment): string[] {
  if (task.reason_points && task.reason_points.length > 0) {
    return task.reason_points;
  }
  return task.reason
    .split(/[;•\n]/)
    .map((point) => point.trim())
    .filter(Boolean);
}

export function TaskRow({ task }: TaskRowProps) {
  const reasonPoints = deriveReasonPoints(task);

  return (
    <div className="task-row">
      <div className="task-header">
        <strong>Task:</strong> {task.task_name}
      </div>
      <div>
        <strong>Assigned To:</strong> {task.assigned_to}
        {task.employee_id ? ` (${task.employee_id})` : ''}
      </div>
      <div>
        <strong>Reason:</strong>
      </div>
      {reasonPoints.length > 0 ? (
        <ul className="reason-list">
          {reasonPoints.map((point, index) => (
            <li key={`${task.task_name}-${index}`}>{point}</li>
          ))}
        </ul>
      ) : (
        <p>{task.reason}</p>
      )}
    </div>
  );
}
