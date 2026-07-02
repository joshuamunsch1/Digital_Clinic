coins = [1,2,5]
num = 11

dp = [1000 for i in range(num)]

for coin in coins:
    dp[coin] = 1

for i in range(num):
    for coin in coins:
        if i + 1 - coin >= 0 and dp[i+1-coin] != 1000:
            dp[i] = min(dp[i+1-coin] + 1, dp[i])

print(dp[-1])