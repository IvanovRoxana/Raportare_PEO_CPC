'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSignedInUser, signOutCurrentUser, type AppRole } from '@/lib/aws/auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { BriefcaseBusiness, LayoutDashboard, Loader2, LogOut, Settings, ShieldCheck, User } from 'lucide-react'

type MenuUser = {
  email?: string
  displayName?: string
  roles: AppRole[]
}

const roleDestinations: Array<{
  role: AppRole
  label: string
  href: string
  icon: typeof LayoutDashboard
}> = [
  { role: 'expert', label: 'Lucrează ca Expert', href: '/expert', icon: LayoutDashboard },
  { role: 'pm', label: 'Lucrează ca PM', href: '/pm', icon: BriefcaseBusiness },
  { role: 'admin', label: 'Lucrează ca Admin', href: '/admin', icon: ShieldCheck },
]

export function UserMenu() {
  const [user, setUser] = useState<MenuUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let isMounted = true

    getSignedInUser().then((currentUser) => {
      if (!isMounted) return
      setUser(currentUser ? { email: currentUser.email, displayName: currentUser.displayName, roles: currentUser.roles } : null)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
    }
  }, [])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await signOutCurrentUser()
    router.push('/auth/login')
    router.refresh()
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  if (!user) {
    return (
      <Button variant="outline" onClick={() => router.push('/auth/login')}>
        <User className="h-4 w-4 mr-2" />
        Autentificare
      </Button>
    )
  }

  const userInitials = user.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email?.slice(0, 2).toUpperCase() || 'U'

  const displayName = user.displayName || user.email || 'Utilizator'
  const availableRoleDestinations = roleDestinations.filter((destination) => user.roles.includes(destination.role))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {userInitials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              Roluri: {user.roles.join(', ')}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoleDestinations.length > 1 && (
          <>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Selectează rolul de lucru
            </DropdownMenuLabel>
            {availableRoleDestinations.map((destination) => {
              const Icon = destination.icon
              return (
                <DropdownMenuItem key={destination.role} onClick={() => router.push(destination.href)}>
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{destination.label}</span>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => router.push('/auth/select-dashboard')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Alege zona de lucru</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="text-red-600 focus:text-red-600"
        >
          {isLoggingOut ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-2 h-4 w-4" />
          )}
          <span>Deconectare</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
