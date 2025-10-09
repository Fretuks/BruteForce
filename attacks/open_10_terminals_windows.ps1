$WorkingDir = "C:\Users\frederik\WebstormProjects\BruteForce\attacks"  #

for ($i = 0; $i -lt 10; $i++) {
    $cmd = "Set-Location -Path `"$WorkingDir`"; node crack3.js test bruteforce $i 10"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $cmd
    Start-Sleep -Milliseconds 100
}
