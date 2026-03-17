
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const userId = "ec50f30f-913e-4f19-99db-a109c5440b33"
    console.log("Checking transactions for user:", userId)
    
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employeeTransactions: true }
    })
    
    if (!user) {
        console.log("User not found")
        return
    }
    
    console.log("User Hire Date:", user.hireDate)
    console.log("Transactions Count:", user.employeeTransactions.length)
    
    user.employeeTransactions.forEach(tx => {
        console.log(`- [${tx.createdAt.toISOString()}] ${tx.type}: ${tx.amount} (${tx.description})`)
    })
    
    const startDate = new Date(2026, 2, 1) // March 1st
    const endDate = new Date(2026, 2, 31, 23, 59, 59)
    
    console.log("Filter Range:", startDate.toISOString(), "to", endDate.toISOString())
    
    const filtered = user.employeeTransactions.filter(tx => {
        const date = tx.createdAt
        return date >= startDate && date <= endDate
    })
    
    console.log("Filtered Results (March):", filtered.length)
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
