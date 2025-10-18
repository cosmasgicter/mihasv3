import React from 'react'
import { motion } from 'framer-motion'
import { GraduationCap } from 'lucide-react'

export function FancyPreloader() {
  return (
    <motion.div
      className="fixed inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="text-center relative">
        {/* Animated background glow */}
        <motion.div
          className="absolute inset-0 blur-3xl opacity-50"
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-32 h-32 bg-white dark:bg-gray-800/30 rounded-full mx-auto" />
        </motion.div>

        {/* Icon */}
        <motion.div
          className="mb-6 relative z-10"
          animate={{ 
            rotate: [0, 360],
            scale: [1, 1.1, 1]
          }}
          transition={{ 
            rotate: { duration: 3, repeat: Infinity, ease: "linear" },
            scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
        >
          <GraduationCap className="w-16 h-16 text-white mx-auto drop-shadow-lg" />
        </motion.div>
        
        {/* Title */}
        <motion.h1
          className="text-3xl font-bold text-white mb-2 relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring' }}
        >
          MIHAS-KATC
        </motion.h1>
        
        {/* Subtitle */}
        <motion.p
          className="text-white/90 mb-8 text-lg relative z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Your Future Starts Here
        </motion.p>
        
        {/* Loading dots */}
        <div className="flex space-x-2 justify-center relative z-10">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-full shadow-lg"
              animate={{ 
                scale: [1, 1.3, 1], 
                opacity: [0.4, 1, 0.4],
                y: [0, -8, 0]
              }}
              transition={{ 
                duration: 1.2, 
                repeat: Infinity, 
                delay: i * 0.15,
                ease: 'easeInOut'
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}