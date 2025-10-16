-- Fix grades calculation: Lower points = Better performance
-- Recalculate points for all applications with grades

-- Create function to calculate best 5 points (sum of 5 lowest grades)
CREATE OR REPLACE FUNCTION calculate_best_five_points(grade_values integer[])
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  valid_grades integer[];
  best_five integer[];
  total integer := 0;
BEGIN
  -- Filter valid grades (1-9) and sort ascending
  SELECT ARRAY_AGG(grade ORDER BY grade)
  INTO valid_grades
  FROM unnest(grade_values) AS grade
  WHERE grade >= 1 AND grade <= 9;
  
  -- Return 0 if no valid grades
  IF valid_grades IS NULL OR array_length(valid_grades, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Take best 5 (lowest) grades
  best_five := valid_grades[1:LEAST(5, array_length(valid_grades, 1))];
  
  -- Sum them
  SELECT SUM(grade) INTO total FROM unnest(best_five) AS grade;
  
  RETURN COALESCE(total, 0);
END;
$$;

-- Update all applications with recalculated points
UPDATE applications
SET points = (
  SELECT calculate_best_five_points(ARRAY_AGG(ag.grade))
  FROM application_grades ag
  WHERE ag.application_id = applications.id
)
WHERE id IN (
  SELECT DISTINCT application_id 
  FROM application_grades
);

-- Add comment explaining the grading system
COMMENT ON FUNCTION calculate_best_five_points IS 
'Zambian grading system: 1-9 scale where 1=best, 9=worst. 
Returns sum of 5 lowest (best) grades. LOWER TOTAL = BETTER PERFORMANCE.
Example: grades [1,2,1,3,1,7,4,6] → best 5 = [1,1,1,2,3] → points = 8';
