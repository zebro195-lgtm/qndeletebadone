import React, { useState, useCallback } from 'react';
import { AlertTriangle, Trash2, Eye, CheckCircle, XCircle, RefreshCw, Database, Zap, Settings, Play, Pause } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validateQuestionWithAI, ExtractedQuestion } from '../lib/gemini';
import { QuestionPreview } from './QuestionPreview';
import toast, { Toaster } from 'react-hot-toast';

interface Exam {
  id: string;
  name: string;
}

interface Course {
  id: string;
  name: string;
  exam_id: string;
}

interface WrongQuestion {
  id: string;
  topic_id: string;
  topic_name: string;
  question_statement: string;
  question_type: 'MCQ' | 'MSQ' | 'NAT' | 'Subjective';
  options: string[] | null;
  answer: string | null;
  solution: string | null;
  created_at: string;
  reason: string;
  confidence: number;
}

interface ValidationProgress {
  currentQuestion: number;
  totalQuestions: number;
  questionsValidated: number;
  questionsRemoved: number;
  isValidating: boolean;
  isPaused: boolean;
  currentQuestionText: string;
}

export function WrongQuestionRemover() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [validationMode, setValidationMode] = useState<'auto' | 'manual'>('manual');
  const [wrongQuestions, setWrongQuestions] = useState<WrongQuestion[]>([]);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [progress, setProgress] = useState<ValidationProgress>({
    currentQuestion: 0,
    totalQuestions: 0,
    questionsValidated: 0,
    questionsRemoved: 0,
    isValidating: false,
    isPaused: false,
    currentQuestionText: ''
  });

  React.useEffect(() => {
    loadExams();
  }, []);

  React.useEffect(() => {
    if (selectedExam) {
      loadCourses(selectedExam);
    }
  }, [selectedExam]);

  const loadExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      toast.error('Failed to load exams');
      console.error('Error loading exams:', error);
    }
  };

  const loadCourses = async (examId: string) => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, exam_id')
        .eq('exam_id', examId)
        .order('name');
      
      if (error) throw error;
      setCourses(data || []);
    } catch (error) {
      toast.error('Failed to load courses');
      console.error('Error loading courses:', error);
    }
  };

  const loadQuestionsCount = async () => {
    if (!selectedCourse) return;

    try {
      const { count, error } = await supabase
        .from('new_questions')
        .select('*', { count: 'exact', head: true })
        .eq('topics.chapters.course_id', selectedCourse);
      
      if (error) throw error;
      setTotalQuestions(count || 0);
    } catch (error) {
      console.error('Error loading questions count:', error);
      setTotalQuestions(0);
    }
  };

  React.useEffect(() => {
    if (selectedCourse) {
      loadQuestionsCount();
    }
  }, [selectedCourse]);

  const validateQuestion = (question: any): { isWrong: boolean; reason: string; confidence: number } => {
    const { question_type, question_statement, options, answer } = question;

    if (!question_statement || question_statement.trim() === '') {
      return { isWrong: true, reason: 'Empty question statement', confidence: 1.0 };
    }

    if (!answer || answer.trim() === '') {
      return { isWrong: true, reason: 'No answer provided', confidence: 1.0 };
    }

    switch (question_type) {
      case 'MCQ':
        return validateMCQQuestion(options, answer);
      case 'MSQ':
        return validateMSQQuestion(options, answer);
      case 'NAT':
        return validateNATQuestion(answer);
      case 'Subjective':
        return { isWrong: false, reason: 'Subjective questions are always valid', confidence: 1.0 };
      default:
        return { isWrong: true, reason: 'Unknown question type', confidence: 1.0 };
    }
  };

  const validateMCQQuestion = (options: string[] | null, answer: string): { isWrong: boolean; reason: string; confidence: number } => {
    if (!options || options.length === 0) {
      return { isWrong: true, reason: 'No options provided for MCQ', confidence: 1.0 };
    }

    const cleanAnswer = answer.trim().toUpperCase();
    const validOptions = ['A', 'B', 'C', 'D', 'E'];
    
    // Check if answer is a valid option letter
    if (!validOptions.includes(cleanAnswer)) {
      return { isWrong: true, reason: `Answer "${answer}" is not a valid option (A, B, C, D, E)`, confidence: 1.0 };
    }
    
    // Check if the option index exists
    const optionIndex = cleanAnswer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
    if (optionIndex >= options.length) {
      return { isWrong: true, reason: `Answer "${answer}" refers to option ${optionIndex + 1} but only ${options.length} options provided`, confidence: 1.0 };
    }

    // For MCQ, only one option should be correct
    const answerOptions = cleanAnswer.split(',').map(opt => opt.trim());
    if (answerOptions.length > 1) {
      return { isWrong: true, reason: 'MCQ should have only one correct answer', confidence: 1.0 };
    }

    return { isWrong: false, reason: 'Valid MCQ question', confidence: 1.0 };
  };

  const validateMSQQuestion = (options: string[] | null, answer: string): { isWrong: boolean; reason: string; confidence: number } => {
    if (!options || options.length === 0) {
      return { isWrong: true, reason: 'No options provided for MSQ', confidence: 1.0 };
    }

    const cleanAnswer = answer.trim().toUpperCase();
    const answerOptions = cleanAnswer.split(',').map(opt => opt.trim());
    const validOptions = ['A', 'B', 'C', 'D', 'E'];
    
    // Check if all answer options are valid letters
    for (const opt of answerOptions) {
      if (!validOptions.includes(opt)) {
        return { isWrong: true, reason: `Answer option "${opt}" is not valid (A, B, C, D, E)`, confidence: 1.0 };
      }
      
      // Check if the option index exists
      const optionIndex = opt.charCodeAt(0) - 65;
      if (optionIndex >= options.length) {
        return { isWrong: true, reason: `Answer option "${opt}" refers to option ${optionIndex + 1} but only ${options.length} options provided`, confidence: 1.0 };
      }
    }

    // MSQ should have at least 1 correct option
    if (answerOptions.length === 0) {
      return { isWrong: true, reason: 'MSQ should have at least 1 correct option', confidence: 1.0 };
    }

    return { isWrong: false, reason: 'Valid MSQ question', confidence: 1.0 };
  };

  const validateNATQuestion = (answer: string): { isWrong: boolean; reason: string; confidence: number } => {
    const cleanAnswer = answer.trim();
    
    // Check if answer is a number (integer or decimal)
    const numberRegex = /^-?\d+(\.\d+)?$/;
    if (!numberRegex.test(cleanAnswer)) {
      return { isWrong: true, reason: `NAT answer "${answer}" is not a valid number`, confidence: 1.0 };
    }

    return { isWrong: false, reason: 'Valid NAT question', confidence: 1.0 };
  };

  const startValidation = async () => {
    if (!selectedCourse) {
      toast.error('Please select a course first');
      return;
    }

    setProgress({
      currentQuestion: 0,
      totalQuestions: 0,
      questionsValidated: 0,
      questionsRemoved: 0,
      isValidating: true,
      isPaused: false,
      currentQuestionText: ''
    });

    try {
      // Get all questions for the selected course
      const { data: questions, error } = await supabase
        .from('new_questions')
        .select(`
          *, 
          topics!inner(
            id, name, 
            chapters!inner(
              course_id
            )
          )
        `)
        .eq('topics.chapters.course_id', selectedCourse);

      if (error) throw error;

      if (!questions || questions.length === 0) {
        toast.success('No questions found for validation');
        setProgress(prev => ({ ...prev, isValidating: false }));
        return;
      }

      setProgress(prev => ({ ...prev, totalQuestions: questions.length }));
      
      const wrongQuestionsFound: WrongQuestion[] = [];
      let questionsRemoved = 0;

      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];

        if (progress.isPaused) {
          await new Promise(resolve => {
            const checkPause = () => {
              if (!progress.isPaused) {
                resolve(undefined);
              } else {
                setTimeout(checkPause, 1000);
              }
            };
            checkPause();
          });
        }

        setProgress(prev => ({
          ...prev,
          currentQuestion: i + 1,
          questionsValidated: i + 1,
          currentQuestionText: question.question_statement.substring(0, 100) + '...'
        }));

        // Basic validation first
        const basicValidation = validateQuestion(question);
        
        let finalValidation = basicValidation;

        // For NAT questions, use AI validation if basic validation passes
        if (question.question_type === 'NAT' && !basicValidation.isWrong) {
          try {
            toast(`🤖 AI validating NAT question ${i + 1}...`, { duration: 2000 });
            const aiValidation = await validateQuestionWithAI(question);
            finalValidation = aiValidation;
            
            // Add delay for AI calls
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (error) {
            console.error('AI validation failed:', error);
            // Fall back to basic validation
          }
        }

        if (finalValidation.isWrong) {
          const wrongQuestion: WrongQuestion = {
            ...question,
            reason: finalValidation.reason,
            confidence: finalValidation.confidence
          };
          
          wrongQuestionsFound.push(wrongQuestion);

          if (validationMode === 'auto') {
            // Auto-delete wrong questions
            try {
              const { error: deleteError } = await supabase
                .from('new_questions')
                .delete()
                .eq('id', question.id);

              if (deleteError) {
                console.error('Error deleting question:', deleteError);
                toast.error(`Failed to delete question ${i + 1}`);
              } else {
                questionsRemoved++;
                toast.success(`❌ Deleted wrong question ${i + 1}: ${finalValidation.reason}`);
              }
            } catch (error) {
              console.error('Error deleting question:', error);
            }
          } else {
            toast.error(`❌ Found wrong question ${i + 1}: ${finalValidation.reason}`);
          }
        } else {
          toast.success(`✅ Question ${i + 1} is valid`);
        }

        setProgress(prev => ({ ...prev, questionsRemoved }));

        // Delay between questions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setWrongQuestions(wrongQuestionsFound);
      
      if (validationMode === 'auto') {
        toast.success(`🎉 Validation complete! Removed ${questionsRemoved} wrong questions out of ${questions.length} total questions.`);
      } else {
        toast.success(`🎉 Validation complete! Found ${wrongQuestionsFound.length} wrong questions out of ${questions.length} total questions.`);
      }

    } catch (error) {
      console.error('Validation error:', error);
      toast.error(`Validation failed: ${error.message}`);
    } finally {
      setProgress(prev => ({ ...prev, isValidating: false, isPaused: false }));
    }
  };

  const pauseValidation = () => {
    setProgress(prev => ({ ...prev, isPaused: !prev.isPaused }));
    toast(progress.isPaused ? '▶️ Validation resumed' : '⏸️ Validation paused');
  };

  const stopValidation = () => {
    setProgress(prev => ({ ...prev, isValidating: false, isPaused: false }));
    toast('🛑 Validation stopped');
  };

  const deleteWrongQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase
        .from('new_questions')
        .delete()
        .eq('id', questionId);

      if (error) throw error;

      setWrongQuestions(prev => prev.filter(q => q.id !== questionId));
      toast.success('Wrong question deleted successfully');
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error('Failed to delete question');
    }
  };

  const deleteAllWrongQuestions = async () => {
    if (wrongQuestions.length === 0) {
      toast.error('No wrong questions to delete');
      return;
    }

    try {
      const questionIds = wrongQuestions.map(q => q.id);
      
      const { error } = await supabase
        .from('new_questions')
        .delete()
        .in('id', questionIds);

      if (error) throw error;

      toast.success(`🎉 Deleted all ${wrongQuestions.length} wrong questions!`);
      setWrongQuestions([]);
    } catch (error) {
      console.error('Error deleting questions:', error);
      toast.error('Failed to delete wrong questions');
    }
  };

  const canStartValidation = selectedCourse && !progress.isValidating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50">
      <Toaster position="top-right" />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-red-600 to-orange-600 p-4 rounded-2xl shadow-lg">
              <AlertTriangle className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-4">
            Wrong Question Remover
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Validate questions in the database and remove incorrect ones automatically or manually review them
          </p>
          
          {/* Features */}
          <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span>Smart Validation</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              <span>AI-Powered NAT Check</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-500" />
              <span>Auto/Manual Mode</span>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Exam Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Database className="w-4 h-4" />
                Select Exam
              </label>
              <select
                value={selectedExam}
                onChange={(e) => setSelectedExam(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              >
                <option value="">Choose an exam...</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Course Selection */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Database className="w-4 h-4" />
                Select Course
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                disabled={!selectedExam}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all disabled:bg-gray-50"
              >
                <option value="">Choose a course...</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Validation Mode */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Settings className="w-4 h-4" />
                Validation Mode
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="manual"
                    checked={validationMode === 'manual'}
                    onChange={(e) => setValidationMode(e.target.value as any)}
                    className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                  />
                  <span className="text-sm">Manual Review (Show wrong questions)</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="auto"
                    checked={validationMode === 'auto'}
                    onChange={(e) => setValidationMode(e.target.value as any)}
                    className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                  />
                  <span className="text-sm">Auto Delete (Remove wrong questions immediately)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Course Statistics */}
          {selectedCourse && totalQuestions > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-blue-800 mb-2">Course Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-700">Total Questions: <strong>{totalQuestions}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-700">Mode: <strong>{validationMode === 'auto' ? 'Auto Delete' : 'Manual Review'}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-700">AI Validation: <strong>Enabled for NAT</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Validation Controls */}
        <div className="flex gap-4 justify-center mb-8">
          {!progress.isValidating ? (
            <button
              onClick={startValidation}
              disabled={!canStartValidation}
              className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Play className="w-5 h-5" />
              {validationMode === 'auto' ? '🚀 Start Auto Validation' : '🔍 Start Manual Validation'}
            </button>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={pauseValidation}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                {progress.isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                {progress.isPaused ? 'Resume' : 'Pause'}
              </button>
              
              <button
                onClick={stopValidation}
                className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                Stop Validation
              </button>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        {progress.isValidating && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-medium text-red-900">
                  🔍 Validating Questions
                  {progress.isPaused && ' (Paused)'}
                </h3>
                <span className="text-sm font-medium text-red-700">
                  {progress.currentQuestion}/{progress.totalQuestions}
                </span>
              </div>
              <p className="text-sm text-red-600 mb-3">
                📝 Current: {progress.currentQuestionText}
              </p>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
              <div
                className="bg-gradient-to-r from-red-600 to-orange-600 h-3 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.currentQuestion / progress.totalQuestions) * 100}%`
                }}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-green-700">Validated: {progress.questionsValidated}</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-700">Wrong Found: {wrongQuestions.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-orange-600" />
                <span className="text-orange-700">Removed: {progress.questionsRemoved}</span>
              </div>
            </div>
          </div>
        )}

        {/* Wrong Questions Display (Manual Mode) */}
        {validationMode === 'manual' && wrongQuestions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-red-800">
                ❌ Wrong Questions Found ({wrongQuestions.length})
              </h2>
              <button
                onClick={deleteAllWrongQuestions}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Delete All Wrong Questions
              </button>
            </div>
            
            <div className="space-y-6">
              {wrongQuestions.map((question, index) => (
                <div key={question.id} className="border border-red-200 rounded-xl p-6 bg-red-50">
                  {/* Error Info */}
                  <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <span className="font-semibold text-red-800">Validation Error</span>
                      <span className="text-sm text-red-600">
                        (Confidence: {(question.confidence * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <p className="text-red-700">{question.reason}</p>
                  </div>

                  {/* Question Preview */}
                  <QuestionPreview
                    question={{
                      question_statement: question.question_statement,
                      question_type: question.question_type,
                      options: question.options,
                      page_number: 1,
                      answer: question.answer,
                      solution: question.solution
                    } as ExtractedQuestion}
                    index={index + 1}
                    showControls={false}
                  />

                  {/* Action Button */}
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => deleteWrongQuestion(question.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete This Question
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Wrong Questions Found */}
        {!progress.isValidating && wrongQuestions.length === 0 && progress.questionsValidated > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-green-100 p-4 rounded-full">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-2">
              🎉 All Questions Are Valid!
            </h2>
            <p className="text-green-600">
              Validated {progress.questionsValidated} questions and found no errors.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}