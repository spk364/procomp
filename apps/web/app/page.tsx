import Link from 'next/link';
import { Button } from '@procomp/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@procomp/ui';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            ProComp
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Modern BJJ tournament management platform - A better alternative to SmoothComp
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Button asChild size="lg">
              <Link href="/tournaments">Browse Tournaments</Link>
            </Button>
            <Button variant="outline" asChild size="lg">
              <Link href="/auth/signup">Create Account</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-indigo-600">
              Everything you need
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Tournament management made simple
            </p>
          </div>
          
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <div className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              
              <Card>
                <CardHeader>
                  <CardTitle>Easy Registration</CardTitle>
                  <CardDescription>
                    Simple competitor registration with automated bracket generation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Streamlined registration process with weight verification and division assignment.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Real-time Scoring</CardTitle>
                  <CardDescription>
                    Live match scoring with instant bracket updates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Keep spectators and competitors updated with real-time match results.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Flexible Payments</CardTitle>
                  <CardDescription>
                    Multiple payment options including Kaspi QR and Stripe
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Support for local and international payment methods.
                  </p>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 