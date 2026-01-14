/**
 * Example Migration Definitions
 * 
 * Demonstrates how to define migrations with rollback and validation
 * Requirements: 10.4
 */

/**
 * Example: Consolidate applications_legacy into applications table
 */
export const consolidateApplicationsMigration = {
  id: 'consolidate_applications_legacy_20250114',
  name: 'Consolidate Legacy Applications',
  description: 'Migrate data from applications_legacy to applications table',
  
  requiredTables: ['applications', 'applications_legacy'],
  
  dataDependencies: [
    {
      table: 'applications_legacy',
      condition: {},
      description: 'Legacy applications table must exist'
    }
  ],

  /**
   * Forward migration
   */
  async up(supabase) {
    // Step 1: Copy data from legacy table
    const { data: legacyApps, error: fetchError } = await supabase
      .from('applications_legacy')
      .select('*');

    if (fetchError) throw fetchError;

    // Step 2: Transform and insert into new table
    const transformedApps = legacyApps.map(app => ({
      // Map legacy fields to new schema
      user_id: app.user_id,
      full_name: app.full_name,
      program: app.program,
      institution: app.institution,
      status: app.status || 'draft',
      payment_status: app.payment_status || 'pending_review',
      created_at: app.created_at,
      updated_at: app.updated_at,
      // Add migration metadata
      migrated_from_legacy: true,
      legacy_id: app.id
    }));

    // Step 3: Insert in batches
    const batchSize = 100;
    for (let i = 0; i < transformedApps.length; i += batchSize) {
      const batch = transformedApps.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('applications')
        .insert(batch);

      if (insertError) throw insertError;
    }

    return {
      migratedCount: legacyApps.length,
      message: `Successfully migrated ${legacyApps.length} applications`
    };
  },

  /**
   * Rollback migration
   */
  async down(supabase) {
    // Remove migrated records
    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('migrated_from_legacy', true);

    if (error) throw error;

    return {
      message: 'Successfully rolled back application consolidation'
    };
  },

  /**
   * Validate migration
   */
  async validate(supabase) {
    const errors = [];

    // Check that all legacy records were migrated
    const { count: legacyCount } = await supabase
      .from('applications_legacy')
      .select('*', { count: 'exact', head: true });

    const { count: migratedCount } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('migrated_from_legacy', true);

    if (legacyCount !== migratedCount) {
      errors.push(`Migration incomplete: ${legacyCount} legacy records but only ${migratedCount} migrated`);
    }

    // Check for data integrity
    const { data: orphanedGrades } = await supabase
      .rpc('find_orphaned_records', {
        table_name: 'application_grades',
        foreign_key: 'application_id',
        referenced_table: 'applications'
      });

    if (orphanedGrades && orphanedGrades.length > 0) {
      errors.push(`Found ${orphanedGrades.length} orphaned grade records`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

/**
 * Example: Add new column with data transformation
 */
export const addEligibilityScoreMigration = {
  id: 'add_eligibility_score_20250114',
  name: 'Add Eligibility Score Column',
  description: 'Add eligibility_score column and calculate scores for existing applications',
  
  requiredTables: ['applications'],

  /**
   * Forward migration
   */
  async up(supabase) {
    // Step 1: Add column (would be done via SQL migration)
    // This is just the data transformation part

    // Step 2: Calculate scores for existing applications
    const { data: applications, error: fetchError } = await supabase
      .from('applications')
      .select('id, eligibility_status');

    if (fetchError) throw fetchError;

    // Step 3: Update scores
    for (const app of applications) {
      const score = calculateEligibilityScore(app.eligibility_status);
      
      const { error: updateError } = await supabase
        .from('applications')
        .update({ eligibility_score: score })
        .eq('id', app.id);

      if (updateError) throw updateError;
    }

    return {
      updatedCount: applications.length,
      message: `Updated eligibility scores for ${applications.length} applications`
    };
  },

  /**
   * Rollback migration
   */
  async down(supabase) {
    // Reset scores to null
    const { error } = await supabase
      .from('applications')
      .update({ eligibility_score: null });

    if (error) throw error;

    return {
      message: 'Successfully reset eligibility scores'
    };
  },

  /**
   * Validate migration
   */
  async validate(supabase) {
    const errors = [];

    // Check that all applications have scores
    const { count: nullScores } = await supabase
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .is('eligibility_score', null);

    if (nullScores > 0) {
      errors.push(`Found ${nullScores} applications without eligibility scores`);
    }

    // Check score ranges
    const { data: invalidScores } = await supabase
      .from('applications')
      .select('id, eligibility_score')
      .or('eligibility_score.lt.0,eligibility_score.gt.100');

    if (invalidScores && invalidScores.length > 0) {
      errors.push(`Found ${invalidScores.length} applications with invalid scores`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

/**
 * Helper function to calculate eligibility score
 */
function calculateEligibilityScore(status) {
  const scoreMap = {
    'eligible': 100,
    'conditionally_eligible': 75,
    'not_eligible': 0,
    'pending_review': 50
  };
  return scoreMap[status] || 50;
}

/**
 * Example: Clean up orphaned records
 */
export const cleanupOrphanedRecordsMigration = {
  id: 'cleanup_orphaned_records_20250114',
  name: 'Clean Up Orphaned Records',
  description: 'Remove orphaned records from related tables',
  
  requiredTables: ['application_grades', 'applications'],

  /**
   * Forward migration
   */
  async up(supabase) {
    // Find and delete orphaned grade records
    const { data: orphanedGrades } = await supabase
      .rpc('find_orphaned_records', {
        table_name: 'application_grades',
        foreign_key: 'application_id',
        referenced_table: 'applications'
      });

    if (orphanedGrades && orphanedGrades.length > 0) {
      const orphanedIds = orphanedGrades.map(r => r.id);
      
      const { error: deleteError } = await supabase
        .from('application_grades')
        .delete()
        .in('id', orphanedIds);

      if (deleteError) throw deleteError;
    }

    return {
      deletedCount: orphanedGrades?.length || 0,
      message: `Cleaned up ${orphanedGrades?.length || 0} orphaned grade records`
    };
  },

  /**
   * Rollback migration
   */
  async down(supabase) {
    // Cannot restore deleted orphaned records
    // This migration is not reversible
    return {
      message: 'Cleanup migration cannot be rolled back - orphaned records were permanently deleted'
    };
  },

  /**
   * Validate migration
   */
  async validate(supabase) {
    const errors = [];

    // Verify no orphaned records remain
    const { data: remainingOrphans } = await supabase
      .rpc('find_orphaned_records', {
        table_name: 'application_grades',
        foreign_key: 'application_id',
        referenced_table: 'applications'
      });

    if (remainingOrphans && remainingOrphans.length > 0) {
      errors.push(`Still found ${remainingOrphans.length} orphaned grade records`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

/**
 * Export all example migrations
 */
export const exampleMigrations = [
  consolidateApplicationsMigration,
  addEligibilityScoreMigration,
  cleanupOrphanedRecordsMigration
];
