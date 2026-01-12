/**
 * Flow Analyzer
 * 
 * Analyzes application workflows and identifies bottlenecks and improvement opportunities
 * Integrates with UserJourneyMapper to provide comprehensive flow analysis
 * 
 * Requirements: 3.1, 3.2, 3.4
 */

import { UserJourneyMapper, type UserJourney, type JourneyAnalysis } from './UserJourneyMapper';
import type { 
  FlowAnalysisResult, 
  FlowBottleneck, 
  AutomationOpportunity, 
  TouchpointAnalysis,
  UserJourneyAnalysis,
  AnalysisResult 
} from '../types';

export class FlowAnalyzer {
  private journeyMapper: UserJourneyMapper;

  constructor() {
    this.journeyMapper = new UserJourneyMapper();
  }

  /**
   * Perform comprehensive flow analysis
   * Requirements: 3.1, 3.2, 3.4
   */
  async performFlowAnalysis(): Promise<AnalysisResult> {
    console.log('🔄 Starting application flow analysis...');
    const startTime = new Date();

    try {
      // Get journey analyses
      const studentAnalysis = this.journeyMapper.analyzeJourney('student_application_journey');
      const adminAnalysis = this.journeyMapper.analyzeJourney('admin_review_journey');

      // Identify bottlenecks
      const bottlenecks = this.identifyBottlenecks();

      // Find automation opportunities
      const automationOpportunities = this.identifyAutomationOpportunities();

      // Analyze touchpoints
      const touchpointAnalysis = this.analyzeTouchpoints();

      const results: FlowAnalysisResult = {
        student_journey: this.convertToUserJourneyAnalysis(studentAnalysis, 'student'),
        admin_journey: this.convertToUserJourneyAnalysis(adminAnalysis, 'admin'),
        bottlenecks,
        automation_opportunities: automationOpportunities,
        touchpoint_analysis: touchpointAnalysis
      };

      const completedAt = new Date();
      console.log(`✅ Flow analysis completed in ${completedAt.getTime() - startTime.getTime()}ms`);
      console.log(`📊 Found ${bottlenecks.length} bottlenecks and ${automationOpportunities.length} automation opportunities`);

      return {
        id: crypto.randomUUID(),
        analysis_type: 'flow',
        status: 'completed',
        started_at: startTime,
        completed_at: completedAt,
        results,
        metadata: {
          total_journeys_analyzed: 2,
          total_steps_analyzed: studentAnalysis.total_steps + adminAnalysis.total_steps,
          total_decision_points: studentAnalysis.decision_points + adminAnalysis.decision_points,
          total_touchpoints: studentAnalysis.touchpoints + adminAnalysis.touchpoints
        }
      };

    } catch (error) {
      console.error('❌ Flow analysis failed:', error);
      return {
        id: crypto.randomUUID(),
        analysis_type: 'flow',
        status: 'failed',
        started_at: startTime,
        completed_at: new Date(),
        results: {},
        error_message: error instanceof Error ? error.message : 'Unknown error',
        metadata: {}
      };
    }
  }

  /**
   * Identify bottlenecks in user journeys
   * Requirements: 3.2
   */
  private identifyBottlenecks(): FlowBottleneck[] {
    const bottlenecks: FlowBottleneck[] = [];
    const journeys = this.journeyMapper.getAllJourneys();

    journeys.forEach(journey => {
      const analysis = this.journeyMapper.analyzeJourney(journey.id);
      
      // Identify time-based bottlenecks (steps taking > 15 minutes)
      journey.steps.forEach(step => {
        if (step.duration_estimate_minutes > 15) {
          bottlenecks.push({
            id: crypto.randomUUID(),
            step_id: step.id,
            step_name: step.name,
            journey_type: journey.actor_type,
            bottleneck_type: 'time',
            impact_score: Math.min(step.duration_estimate_minutes / 5, 10), // Scale 1-10
            estimated_delay_minutes: step.duration_estimate_minutes,
            affected_users_percentage: this.estimateAffectedUsers(step, journey),
            recommended_solution: this.generateBottleneckSolution(step)
          });
        }
      });

      // Identify manual intervention bottlenecks
      journey.decision_points.forEach(decisionPoint => {
        if (decisionPoint.current_automation_level === 'manual' && 
            decisionPoint.automation_potential === 'high') {
          bottlenecks.push({
            id: crypto.randomUUID(),
            step_id: decisionPoint.step_id,
            step_name: decisionPoint.name,
            journey_type: journey.actor_type,
            bottleneck_type: 'manual_intervention',
            impact_score: 8, // High impact for manual high-automation-potential tasks
            estimated_delay_minutes: 10, // Estimated manual processing time
            affected_users_percentage: 100, // All users affected by manual processes
            recommended_solution: `Automate ${decisionPoint.name} using business rules engine`
          });
        }
      });
    });

    return bottlenecks.sort((a, b) => b.impact_score - a.impact_score);
  }

  /**
   * Identify automation opportunities
   * Requirements: 3.4
   */
  private identifyAutomationOpportunities(): AutomationOpportunity[] {
    const opportunities: AutomationOpportunity[] = [];
    const allDecisionPoints = this.journeyMapper.getAllDecisionPoints();

    allDecisionPoints.forEach(decisionPoint => {
      if (decisionPoint.automation_potential !== 'none' && 
          decisionPoint.current_automation_level !== 'automated') {
        
        const timeSavings = this.calculateTimeSavings(decisionPoint);
        const complexity = this.assessImplementationComplexity(decisionPoint);
        const roi = this.calculateROI(timeSavings, complexity);

        opportunities.push({
          id: crypto.randomUUID(),
          decision_point_id: decisionPoint.id,
          decision_point_name: decisionPoint.name,
          current_automation_level: decisionPoint.current_automation_level,
          automation_potential: decisionPoint.automation_potential,
          estimated_time_savings_minutes: timeSavings,
          implementation_complexity: complexity,
          roi_estimate: roi
        });
      }
    });

    return opportunities.sort((a, b) => b.roi_estimate - a.roi_estimate);
  }

  /**
   * Analyze touchpoints for optimization opportunities
   */
  private analyzeTouchpoints(): TouchpointAnalysis[] {
    const touchpoints = this.journeyMapper.getAllTouchpoints();
    
    return touchpoints.map(touchpoint => ({
      id: crypto.randomUUID(),
      touchpoint_name: touchpoint.name,
      channel: touchpoint.channel,
      frequency: touchpoint.frequency,
      user_satisfaction_score: touchpoint.user_satisfaction_score,
      effectiveness_score: this.calculateTouchpointEffectiveness(touchpoint),
      optimization_recommendations: this.generateTouchpointRecommendations(touchpoint)
    }));
  }

  /**
   * Helper methods
   */
  private convertToUserJourneyAnalysis(analysis: JourneyAnalysis, journeyType: 'student' | 'admin'): UserJourneyAnalysis {
    return {
      journey_id: analysis.journey_id,
      journey_name: journeyType === 'student' ? 'Student Application Journey' : 'Admin Review Journey',
      total_steps: analysis.total_steps,
      manual_steps: analysis.manual_steps,
      automated_steps: analysis.automated_steps,
      estimated_completion_time: analysis.estimated_completion_time,
      bottleneck_steps: analysis.bottleneck_steps,
      improvement_opportunities: analysis.improvement_opportunities,
      success_rate: journeyType === 'student' ? 85 : 95, // Estimated based on typical application systems
      abandonment_rate: journeyType === 'student' ? 15 : 5
    };
  }

  private estimateAffectedUsers(step: any, journey: UserJourney): number {
    // Estimate percentage of users affected by this bottleneck
    if (journey.actor_type === 'student') {
      // All students go through most steps
      return step.type === 'action' ? 100 : 80;
    } else {
      // Admin steps affect processing efficiency
      return 100;
    }
  }

  private generateBottleneckSolution(step: any): string {
    const solutions = {
      'action': `Optimize ${step.name} with better UX and auto-fill capabilities`,
      'decision': `Implement decision support tools for ${step.name}`,
      'system': `Optimize system performance for ${step.name}`,
      'touchpoint': `Streamline communication for ${step.name}`
    };
    
    return solutions[step.type as keyof typeof solutions] || `Optimize ${step.name} process`;
  }

  private calculateTimeSavings(decisionPoint: any): number {
    const baseSavings = {
      'high': 20,
      'medium': 10,
      'low': 5,
      'none': 0
    };
    
    const multiplier = {
      'manual': 1.0,
      'semi_automated': 0.5,
      'automated': 0.0
    };
    
    return baseSavings[decisionPoint.automation_potential as keyof typeof baseSavings] * 
           multiplier[decisionPoint.current_automation_level as keyof typeof multiplier];
  }

  private assessImplementationComplexity(decisionPoint: any): 'low' | 'medium' | 'high' {
    // Simple heuristic based on decision point characteristics
    if (decisionPoint.criteria.length <= 2) return 'low';
    if (decisionPoint.criteria.length <= 4) return 'medium';
    return 'high';
  }

  private calculateROI(timeSavings: number, complexity: 'low' | 'medium' | 'high'): number {
    const implementationCost = {
      'low': 10,
      'medium': 25,
      'high': 50
    };
    
    // ROI = (Time Savings per month * 12) / Implementation Cost
    const monthlySavings = timeSavings * 30; // Assuming daily usage
    const annualSavings = monthlySavings * 12;
    const cost = implementationCost[complexity];
    
    return Math.round((annualSavings / cost) * 100) / 100;
  }

  private calculateTouchpointEffectiveness(touchpoint: any): number {
    // Simple effectiveness scoring based on channel and frequency
    const channelScores = {
      'email': 8,
      'sms': 9,
      'whatsapp': 9,
      'web': 7,
      'phone': 6,
      'in_person': 10
    };
    
    const frequencyMultiplier = {
      'once': 1.0,
      'multiple': 0.8, // Diminishing returns
      'conditional': 0.9
    };
    
    const baseScore = channelScores[touchpoint.channel as keyof typeof channelScores] || 5;
    const multiplier = frequencyMultiplier[touchpoint.frequency as keyof typeof frequencyMultiplier] || 1.0;
    
    return Math.round(baseScore * multiplier * 10) / 10;
  }

  private generateTouchpointRecommendations(touchpoint: any): string[] {
    const recommendations: string[] = [];
    
    if (touchpoint.frequency === 'multiple') {
      recommendations.push('Consider consolidating multiple communications into digest format');
    }
    
    if (touchpoint.channel === 'email' && !touchpoint.user_satisfaction_score) {
      recommendations.push('Add user satisfaction tracking for email communications');
    }
    
    if (touchpoint.channel === 'phone') {
      recommendations.push('Consider migrating to digital channels for better scalability');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Monitor user engagement and optimize timing');
    }
    
    return recommendations;
  }

  /**
   * Public getters for integration
   */
  getJourneyMapper(): UserJourneyMapper {
    return this.journeyMapper;
  }

  /**
   * Get specific journey analysis
   */
  getJourneyAnalysis(journeyId: string): JourneyAnalysis {
    return this.journeyMapper.analyzeJourney(journeyId);
  }

  /**
   * Get visualization data for dashboards
   */
  getVisualizationData(journeyId: string) {
    return this.journeyMapper.generateVisualizationData(journeyId);
  }
}