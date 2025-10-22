import { memo } from 'react'
import { CheckCircle, Circle } from 'lucide-react'
import { motion } from 'framer-motion'

interface ChecklistItem {
  label: string
  completed: boolean
}

interface StepChecklistProps {
  items: ChecklistItem[]
  title?: string
}

export const StepChecklist = memo(({ items, title = 'Step Checklist' }: StepChecklistProps) => {
  const completedCount = items.filter(item => item.completed).length
  const allCompleted = completedCount === items.length

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className={`text-xs font-medium ${allCompleted ? 'text-success' : 'text-muted-foreground'}`}>
          {completedCount}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-2"
          >
            {item.completed ? (
              <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className={`text-sm ${item.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
              {item.label}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
})

StepChecklist.displayName = 'StepChecklist'
