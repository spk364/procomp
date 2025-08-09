'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@procomp/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@procomp/ui';

// Types
interface Tournament {
  id: string;
  name: string;
  date: string;
}

interface Category {
  id: string;
  name: string;
  weightMin: number;
  weightMax: number;
  ageMin: number;
  ageMax: number;
}

// Zod validation schema
const registrationSchema = z.object({
  tournament: z.string().min(1, { message: 'Tournament is required' }),
  category: z.string().min(1, { message: 'Category is required' }),
  fullName: z.string().min(1, { message: 'Full name is required' }),
  club: z.string().min(1, { message: 'Club is required' }),
  age: z.coerce.number().min(10, { message: 'Age must be greater than 10' }),
  weight: z.coerce.number().min(1, { message: 'Weight is required' }),
  email: z.string().email({ message: 'Valid email is required' }),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function RegisterPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  // Fetch tournaments and categories on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tournamentsResponse, categoriesResponse] = await Promise.all([
          fetch('/api/v1/tournaments'),
          fetch('/api/v1/categories'),
        ]);

        if (tournamentsResponse.ok) {
          const tournamentsData = await tournamentsResponse.json();
          setTournaments(tournamentsData);
        }

        if (categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          setCategories(categoriesData);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setErrorMessage('Failed to load tournaments and categories');
      }
    };

    fetchData();
  }, []);

  const onSubmit = async (data: RegistrationFormData) => {
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/v1/participants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        setSuccessMessage('Registration successful! You will receive a confirmation email shortly.');
        reset();
      } else {
        const errorData = await response.json();
        setErrorMessage(errorData.message || 'Registration failed. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting registration:', error);
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Tournament Registration
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Register to compete in upcoming BJJ tournaments
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Participant Information</CardTitle>
            <CardDescription>
              Please fill out all required fields to complete your registration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Tournament Selection */}
              <div>
                <label htmlFor="tournament" className="block text-sm font-medium text-gray-700 mb-2">
                  Tournament *
                </label>
                <select
                  id="tournament"
                  {...register('tournament')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="">Select a tournament</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name} - {new Date(tournament.date).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                {errors.tournament && (
                  <p className="mt-1 text-sm text-red-600">{errors.tournament.message}</p>
                )}
              </div>

              {/* Category Selection */}
              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category *
                </label>
                <select
                  id="category"
                  {...register('category')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.weightMin}-{category.weightMax}kg, Age {category.ageMin}-{category.ageMax})
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
                )}
              </div>

              {/* Personal Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Full Name */}
                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="fullName"
                    {...register('fullName')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your full name"
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                  )}
                </div>

                {/* Club */}
                <div>
                  <label htmlFor="club" className="block text-sm font-medium text-gray-700 mb-2">
                    Club *
                  </label>
                  <input
                    type="text"
                    id="club"
                    {...register('club')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your club name"
                  />
                  {errors.club && (
                    <p className="mt-1 text-sm text-red-600">{errors.club.message}</p>
                  )}
                </div>

                {/* Age */}
                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-2">
                    Age *
                  </label>
                  <input
                    type="number"
                    id="age"
                    {...register('age')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your age"
                    min="10"
                  />
                  {errors.age && (
                    <p className="mt-1 text-sm text-red-600">{errors.age.message}</p>
                  )}
                </div>

                {/* Weight */}
                <div>
                  <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-2">
                    Weight (kg) *
                  </label>
                  <input
                    type="number"
                    id="weight"
                    {...register('weight')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter your weight in kg"
                    step="0.1"
                    min="1"
                  />
                  {errors.weight && (
                    <p className="mt-1 text-sm text-red-600">{errors.weight.message}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  {...register('email')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter your email address"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              {/* Success Message */}
              {successMessage && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">{successMessage}</p>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{errorMessage}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full md:w-auto px-8 py-2"
                  size="lg"
                >
                  {isLoading ? 'Registering...' : 'Register for Tournament'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Questions about registration?{' '}
            <a href="mailto:support@procomp.com" className="text-indigo-600 hover:text-indigo-500">
              Contact our support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 