import React from 'react'
import { motion } from 'framer-motion'
import { GraduationCap } from 'lucide-react'

export function FancyPreloader() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center z-50">
      <div className="text-center">
        <motion.div
          className="mb-8"
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <GraduationCap className="w-16 h-16 text-white mx-auto" />
        </motion.div>
        
        <motion.h1
          className="text-2xl font-bold text-white mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          MIHAS-KATC
        </motion.h1>
        
        <motion.p
          className="text-white/80 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Your Future Starts Here
        </motion.p>
        
        <div className="flex space-x-2 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 bg-white rounded-full"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}